import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exists, isFile, isDirectory, safeJoin, folderSize } from './paths.js';
import { getSettings } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GameValidation {
  folder: string;
  executable: string | null;
  executablePath: string | null;
  folderSize: number;
  valid: boolean;
  missing: string[];
}

export interface LaunchResult {
  success: boolean;
  error?: string;
  pid?: number;
}

export interface RepairResult {
  checked: number;
  missing: string[];
  ok: boolean;
}

export async function validateGameFolder(folder: string): Promise<GameValidation> {
  const result: GameValidation = {
    folder,
    executable: null,
    executablePath: null,
    folderSize: 0,
    valid: false,
    missing: []
  };

  if (!folder || !exists(folder) || !isDirectory(folder)) {
    result.missing.push('Folder does not exist');
    return result;
  }

  try {
    result.folderSize = await folderSize(folder);
  } catch {
    result.folderSize = 0;
  }

  // 1. Look for the game executable (flat + one level deep)
  const execNames = [
    'Rumbleverse.exe',
    'RumbleverseClient.exe',
    'RumbleverseClient-Win64-Shipping.exe',
    'RumbleverseClient-Win32-Shipping.exe'
  ];

  const searchDirs = [folder];
  try {
    for (const e of fs.readdirSync(folder, { withFileTypes: true })) {
      if (e.isDirectory()) searchDirs.push(path.join(folder, e.name));
    }
  } catch { /* ignore */ }

  outer: for (const dir of searchDirs) {
    for (const name of execNames) {
      const p = safeJoin(dir, name);
      if (isFile(p)) {
        result.executable = path.relative(folder, p);
        result.executablePath = p;
        break outer;
      }
    }
  }

  // 2. Key subfolders (advisory — reported in `missing` if absent)
  const keyFolders = ['Engine', 'Rumbleverse', 'RumbleverseGame', 'Content'];
  for (const f of keyFolders) {
    if (!exists(path.join(folder, f))) {
      result.missing.push(`folder:${f}`);
    }
  }

  if (!result.executablePath) {
    result.missing.push(`executable:${execNames.join(', ')}`);
  }

  result.valid = !!result.executablePath;
  return result;
}

export interface GameProcess {
  pid: number;
  spawnedAt: number;
  exitCode: number | null;
  exited: boolean;
  stdout: string;
  stderr: string;
}

let active: GameProcess | null = null;
let statusListener: ((status: ReturnType<typeof getGameStatus>) => void) | null = null;

export function setStatusListener(fn: ((status: ReturnType<typeof getGameStatus>) => void) | null) {
  statusListener = fn;
}

function emitStatus() {
  statusListener?.(getGameStatus());
}

export function launchGame(args: string[] = []): LaunchResult {
  const settings = getSettings();
  if (!settings.gameFolder || !settings.gameExecutable) {
    return { success: false, error: 'Game folder not selected' };
  }
  const exePath = safeJoin(settings.gameFolder, settings.gameExecutable);
  if (!isFile(exePath)) {
    return { success: false, error: `Executable not found: ${settings.gameExecutable}` };
  }
  if (active && !active.exited) {
    return { success: false, error: 'Game already running' };
  }

  let child;
  try {
    child = spawn(exePath, args, {
      cwd: settings.gameFolder,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false
    });
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Spawn failed' };
  }

  active = {
    pid: child.pid ?? 0,
    spawnedAt: Date.now(),
    exitCode: null,
    exited: false,
    stdout: '',
    stderr: ''
  };
  emitStatus();

  child.stdout?.on('data', (d: Buffer) => {
    if (active) active.stdout += d.toString();
  });
  child.stderr?.on('data', (d: Buffer) => {
    if (active) active.stderr += d.toString();
  });
  child.on('error', (err) => {
    if (active) {
      active.stderr += err.message + '\n';
      active.exited = true;
      active.exitCode = -1;
    }
    emitStatus();
  });
  child.on('exit', (code) => {
    if (active) {
      active.exitCode = code;
      active.exited = true;
    }
    emitStatus();
  });

  child.unref();
  return { success: true, pid: child.pid };
}

export function getGameStatus() {
  return active
    ? {
        running: !active.exited,
        pid: active.pid,
        spawnedAt: active.spawnedAt,
        exitCode: active.exitCode,
        exited: active.exited,
        stdout: active.stdout.slice(-20000),
        stderr: active.stderr.slice(-20000)
      }
    : {
        running: false,
        pid: null,
        spawnedAt: null,
        exitCode: null,
        exited: false,
        stdout: '',
        stderr: ''
      };
}

export function stopGame(): boolean {
  if (!active || active.exited) return false;
  try {
    process.kill(active.pid);
    return true;
  } catch {
    return false;
  }
}

/**
 * Поиск ников игроков в файлах игры: сканируем логи Unreal
 * (<gameFolder>/Saved/Logs/*.log) и вытаскиваем имена игроков.
 * ID — стабильные 3 цифры от хэша ника.
 */
export interface FoundPlayer {
  id: string;
  nickname: string;
}

export async function searchPlayersInLogs(folder: string, query: string): Promise<FoundPlayer[]> {
  const q = query.trim().toLowerCase();
  if (!folder || !q || q.length < 2) return [];

  const logsDir = safeJoin(folder, path.join('Saved', 'Logs'));
  if (!exists(logsDir) || !isDirectory(logsDir)) return [];

  let files: string[] = [];
  try {
    files = fs
      .readdirSync(logsDir)
      .filter((f) => f.toLowerCase().endsWith('.log'))
      .sort()
      .slice(-5); // последние 5 логов
  } catch {
    return [];
  }

  const found = new Map<string, string>(); // lower -> original
  const patterns = [
    /(?:PlayerName|PlayerId|NickName|UserName|Name)\s*[:=]\s*["']?([A-Za-z0-9_.\-]{3,24})/gi,
    /\b([A-Za-z][A-Za-z0-9_]{2,19}(?:\d|_)[A-Za-z0-9_]{0,18})\b/g // ник-стиль: есть цифра/подчёркивание
  ];

  for (const f of files) {
    try {
      const p = safeJoin(logsDir, f);
      const stat = fs.statSync(p);
      const buf = Buffer.alloc(Math.min(stat.size, 2 * 1024 * 1024));
      const fd = fs.openSync(p, 'r');
      fs.readSync(fd, buf, 0, buf.length, Math.max(0, stat.size - buf.length));
      fs.closeSync(fd);
      const text = buf.toString('utf8');
      for (const re of patterns) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) && found.size < 200) {
          const name = m[1];
          const low = name.toLowerCase();
          if (low.includes(q) && !found.has(low)) found.set(low, name);
        }
      }
    } catch { /* пропускаем битый лог */ }
  }

  return [...found.values()]
    .slice(0, 50)
    .map((nickname) => {
      let h = 0;
      for (let i = 0; i < nickname.length; i++) h = (h * 31 + nickname.charCodeAt(i)) >>> 0;
      return { id: String(100 + (h % 900)), nickname };
    });
}

/**
 * Авто-детект папки игры при первом запуске: если папка не выбрана,
 * проверяем типовые места (Downloads, Games, Program Files) и берём
 * первую валидную — чтобы поиск игроков и запуск работали «из коробки».
 */
export async function autoDetectGameFolder(): Promise<string | null> {
  const home = process.env.USERPROFILE || '';
  const candidates = [
    path.join(home, 'Downloads', 'Rumbleverse-client'),
    path.join(home, 'Downloads', 'Rumbleverse'),
    path.join(home, 'Games', 'Rumbleverse'),
    path.join(home, 'Games', 'Rumbleverse-client'),
    'C:\\Program Files\\Rumbleverse',
    'C:\\Program Files (x86)\\Rumbleverse',
    'D:\\Games\\Rumbleverse',
    'D:\\Games\\Rumbleverse-client'
  ];
  for (const c of candidates) {
    try {
      if (!exists(c) || !isDirectory(c)) continue;
      const v = await validateGameFolder(c);
      if (v.valid && v.executable) {
        return c;
      }
    } catch { /* next */ }
  }
  return null;
}

export async function repairFiles(): Promise<RepairResult> {
  const settings = getSettings();
  if (!settings.gameFolder) {
    return { checked: 0, missing: ['Game folder not selected'], ok: false };
  }

  // Manifest lives next to the game by default; falls back to bundled config manifest.
  const manifestPath = path.join(__dirname, '../../config/file-manifest.json');
  const result: RepairResult = { checked: 0, missing: [], ok: true };

  try {
    const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
    const files: Array<{ path: string; sha256?: string }> = manifest.files ?? [];
    for (const f of files) {
      result.checked++;
      const p = safeJoin(settings.gameFolder, f.path);
      if (!exists(p)) {
        result.missing.push(f.path);
      }
    }
  } catch (err: any) {
    result.missing.push(`manifest: ${err?.message ?? 'unreadable'}`);
  }

  result.ok = result.missing.length === 0;
  return result;
}
