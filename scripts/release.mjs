/* ---------------------------------------------------------------------------
 * RELEASE — полная пересборка установщика после КАЖДОГО изменения.
 *
 *   npm run release
 *
 * Что делает:
 *  1) автоматически поднимает patch-версию (1.0.0 -> 1.0.1 ...)
 *  2) пишет public/build-info.json (версия + время сборки + хэш исходников),
 *     чтобы установленный клиент знал, какая это сборка
 *  3) typecheck -> main/preload -> renderer -> NSIS installer
 *  4) копирует установщик в СТАБИЛЬНОЕ имя Rumblewersfad-Setup.exe в корне
 *     (всегда последняя версия — просто запускай его)
 *  5) пишет release/latest.json + release/LATEST.txt (манифест обновления)
 *  6) генерирует release/<name>.torrent для раздачи через торрент
 *
 * Переменные окружения:
 *   VERSION=1.2.3        явно задать версию (иначе autopatch)
 *   SKIP_TORRENT=1       не генерировать .torrent
 *   RELEASE_NOTES="..."  текст изменений
 * ------------------------------------------------------------------------- */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const pkgPath = path.join(ROOT, 'package.json');
const builderYml = path.join(ROOT, 'electron-builder.yml');
const releaseDir = path.join(ROOT, 'release');
const publicDir = path.join(ROOT, 'public');

const log = (...a) => console.log('[release]', ...a);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf8');

function run(cmd, args, env = {}) {
  log('$', cmd, args.join(' '));
  execFileSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false', ...env }
  });
}

/** Хэш всех исходников — чтобы видеть, что сборка реально свежая. */
function sourceHash() {
  const h = crypto.createHash('sha256');
  const dirs = ['src', 'config', 'public', 'scripts', 'server'];
  const files = ['index.html', 'package.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.node.json', 'electron-builder.yml'];
  for (const d of dirs) {
    const root = path.join(ROOT, d);
    if (!fs.existsSync(root)) continue;
    const walk = (p) => {
      for (const e of fs.readdirSync(p, { withFileTypes: true })) {
        const f = path.join(p, e.name);
        if (e.isDirectory()) walk(f);
        else if (e.isFile() && !/build-info\.json|latest\.json|\.torrent$/.test(e.name)) {
          h.update(path.relative(ROOT, f).replace(/\\/g, '/'));
          h.update(fs.readFileSync(f));
        }
      }
    };
    walk(root);
  }
  for (const f of files) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) { h.update(f); h.update(fs.readFileSync(p)); }
  }
  return h.digest('hex').slice(0, 16);
}

/* ---- 1. версия ---- */
const pkg = readJson(pkgPath);
let version = process.env.VERSION?.trim();
if (!version) {
  const parts = String(pkg.version || '1.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  version = parts.join('.');
}
pkg.version = version;
writeJson(pkgPath, pkg);
log('version =', version);

/* ---- 2. build-info ---- */
const builtAt = new Date().toISOString();
const hash = sourceHash();
const buildInfo = {
  version,
  builtAt,
  sourceHash: hash,
  notes: process.env.RELEASE_NOTES || ''
};
fs.mkdirSync(publicDir, { recursive: true });
writeJson(path.join(publicDir, 'build-info.json'), buildInfo);
log('build-info:', builtAt, hash);

/* ---- 3. сборка ---- */
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'build:electron']);
run('npx', ['vite', 'build']);
run('npx', ['electron-builder', '--win', 'nsis']);

/* ---- 4. стабильный установщик ---- */
const produced = path.join(releaseDir, `Rumblewersfad-Setup-${version}.exe`);
if (!fs.existsSync(produced)) {
  // electron-builder иногда кладёт файл с иным именем — ищем последний exe
  const candidates = fs.readdirSync(releaseDir)
    .filter((f) => /^Rumblewersfad-Setup-.*\.exe$/.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(releaseDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (candidates.length) {
    log('using produced installer:', candidates[0].f);
    fs.copyFileSync(path.join(releaseDir, candidates[0].f), produced);
  } else {
    throw new Error('Installer not found in release/');
  }
}
const stable = path.join(ROOT, 'Rumblewersfad-Setup.exe');
fs.copyFileSync(produced, stable);
const buf = fs.readFileSync(produced);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
log('stable installer:', stable, `${(buf.length / 1024 / 1024).toFixed(1)} MB`);

/* ---- 5. манифест обновления ---- */
const latest = {
  version,
  builtAt,
  sourceHash: hash,
  notes: buildInfo.notes,
  file: `Rumblewersfad-Setup-${version}.exe`,
  stableFile: 'Rumblewersfad-Setup.exe',
  size: buf.length,
  sha256
};
fs.mkdirSync(releaseDir, { recursive: true });
writeJson(path.join(releaseDir, 'latest.json'), latest);
fs.writeFileSync(
  path.join(releaseDir, 'LATEST.txt'),
  `Rumblewersfad ${version}\nBuilt: ${builtAt}\nSource: ${hash}\nFile: Rumblewersfad-Setup.exe\nSHA256: ${sha256}\n${buildInfo.notes ? '\n' + buildInfo.notes + '\n' : ''}`,
  'utf8'
);

/* ---- 6. .torrent (bencode без внешних зависимостей) ---- */
function bencode(v) {
  if (typeof v === 'number') return Buffer.from(`i${v}e`);
  if (typeof v === 'string') return Buffer.from(`${Buffer.byteLength(v)}:${v}`);
  if (Buffer.isBuffer(v)) return Buffer.concat([Buffer.from(`${v.length}:`), v]);
  if (Array.isArray(v)) return Buffer.concat([Buffer.from('l'), ...v.map(bencode), Buffer.from('e')]);
  const keys = Object.keys(v).sort();
  const parts = [Buffer.from('d')];
  for (const k of keys) { parts.push(bencode(k), bencode(v[k])); }
  parts.push(Buffer.from('e'));
  return Buffer.concat(parts);
}

const torrentCfgPath = path.join(ROOT, 'config', 'release-torrent.json');
const defaultTrackers = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce'
];
let torrentCfg = { trackers: defaultTrackers, webSeeds: [], pieceLength: 512 * 1024 };
if (fs.existsSync(torrentCfgPath)) {
  try { torrentCfg = { ...torrentCfg, ...readJson(torrentCfgPath) }; } catch { /* ignore */ }
} else {
  fs.mkdirSync(path.dirname(torrentCfgPath), { recursive: true });
  writeJson(torrentCfgPath, torrentCfg);
}

if (!process.env.SKIP_TORRENT) {
  const pieceLen = Math.max(16 * 1024, Number(torrentCfg.pieceLength) || 512 * 1024);
  const pieces = [];
  for (let i = 0; i < buf.length; i += pieceLen) {
    pieces.push(crypto.createHash('sha1').update(buf.subarray(i, i + pieceLen)).digest());
  }
  const info = {
    name: path.basename(produced),
    'piece length': pieceLen,
    pieces: Buffer.concat(pieces),
    length: buf.length
  };
  const torrent = {
    announce: torrentCfg.trackers?.[0] || defaultTrackers[0],
    'announce-list': (torrentCfg.trackers || defaultTrackers).map((t) => [t]),
    'created by': 'Rumblewersfad release script',
    'creation date': Math.floor(Date.now() / 1000),
    'url-list': torrentCfg.webSeeds || [],
    info
  };
  const torrentPath = path.join(releaseDir, `Rumblewersfad-Setup-${version}.exe.torrent`);
  fs.writeFileSync(torrentPath, bencode(torrent));
  // Стабильное имя для торрента — всегда указывает на последнюю сборку
  fs.copyFileSync(torrentPath, path.join(releaseDir, 'Rumblewersfad-Setup.exe.torrent'));
  log('torrent:', torrentPath, `${pieces.length} pieces`);
}

log('DONE →', version, '| installer:', stable, '| manifest: release/latest.json');
