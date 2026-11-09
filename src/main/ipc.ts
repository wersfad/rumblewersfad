import { app, dialog, ipcMain, shell, BrowserWindow, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { store, getSettings, setSettings, getOrCreatePlayerId, Settings } from './store.js';
import {
  validateGameFolder,
  launchGame,
  stopGame,
  getGameStatus,
  repairFiles,
  searchPlayersInLogs,
  setStatusListener
} from './game.js';
import { isAbsolute, exists, folderSize, formatBytes } from './paths.js';
import { log, readLogs, logPath } from './logs.js';
import { notifyGameStatus } from './community.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function send(win: BrowserWindow | null, channel: string, payload: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

export function registerIpc(getWindow: () => BrowserWindow | null) {
  const win = () => getWindow();

  setStatusListener((status) => {
    send(win(), 'game:status', status);
    // Как только игра запустилась/закрылась — сразу обновляем inGame в каталоге
    notifyGameStatus();
  });

  // ---- window controls ----
  // minimize/close здесь; maximize обрабатывается в window.ts (registerWindowIpc),
  // чтобы не было двойной регистрации одного канала.
  ipcMain.on('window:minimize', () => win()?.minimize());
  ipcMain.on('window:close', () => win()?.close());

  // ---- dialogs ----
  ipcMain.handle('dialog:selectFolder', async () => {
    const w = win();
    const res = await dialog.showOpenDialog(w!, {
      title: 'Select Rumbleverse game folder',
      properties: ['openDirectory', 'dontAddToRecent']
    });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    const folder = res.filePaths[0];
    if (!isAbsolute(folder) || !exists(folder)) {
      return { canceled: false, error: 'Invalid folder path' };
    }
    const validation = await validateGameFolder(folder);
    if (validation.valid && validation.executable) {
      setSettings({ gameFolder: folder, gameExecutable: validation.executable });
    }
    return { canceled: false, folder, validation };
  });

  // ---- game ----
  ipcMain.handle('game:validate', async (_e, folder: string) => {
    if (typeof folder !== 'string' || !isAbsolute(folder)) {
      return { error: 'Invalid path' };
    }
    return await validateGameFolder(folder);
  });

  ipcMain.handle('game:launch', (_e, args?: string[]) => {
    const safeArgs = Array.isArray(args) ? args.filter((a) => typeof a === 'string') : [];
    const r = launchGame(safeArgs);
    log(`launch: ${r.success ? 'ok pid=' + r.pid : r.error}`);
    if (r.success) send(win(), 'toast', { type: 'success', text: 'Game launched' });
    else send(win(), 'toast', { type: 'error', text: r.error ?? 'Launch failed' });
    return r;
  });

  ipcMain.handle('game:safeLaunch', (_e, args?: string[]) => {
    const settings = getSettings();
    const extra = Array.isArray(args) ? args : settings.launchArgs;
    const safeArgs = extra.filter((a) => typeof a === 'string');
    const r = launchGame(['-safe', ...safeArgs]);
    log(`safe launch: ${r.success ? 'ok' : r.error}`);
    return r;
  });

  ipcMain.handle('game:stop', () => {
    const ok = stopGame();
    send(win(), 'toast', { type: ok ? 'info' : 'error', text: ok ? 'Stop signal sent' : 'Cannot stop game' });
    return { stopped: ok };
  });

  ipcMain.handle('game:status', () => getGameStatus());

  ipcMain.handle('game:searchPlayers', async (_e, query: string) => {
    const s = getSettings();
    if (!s.gameFolder || typeof query !== 'string') return [];
    try {
      return await searchPlayersInLogs(s.gameFolder, query);
    } catch {
      return [];
    }
  });

  ipcMain.handle('game:repair', async () => {
    const r = await repairFiles();
    log(`repair: checked=${r.checked} missing=${r.missing.length}`);
    send(win(), 'toast', {
      type: r.ok ? 'success' : 'warning',
      text: r.ok ? `All ${r.checked} files OK` : `Missing ${r.missing.length} file(s)`
    });
    return r;
  });

  ipcMain.handle('folder:info', async () => {
    const s = getSettings();
    if (!s.gameFolder || !exists(s.gameFolder)) {
      return { folder: null, size: 0, sizeText: '—', valid: false };
    }
    const size = await folderSize(s.gameFolder);
    const validation = await validateGameFolder(s.gameFolder);
    return { folder: s.gameFolder, size, sizeText: formatBytes(size), valid: validation.valid, validation };
  });

  ipcMain.handle('folder:open', async () => {
    const s = getSettings();
    if (!s.gameFolder || !exists(s.gameFolder)) return { error: 'Folder not set' };
    await shell.openPath(s.gameFolder);
    return { ok: true };
  });

  // ---- logs ----
  ipcMain.handle('logs:get', () => readLogs());
  ipcMain.handle('logs:copy', () => {
    clipboard.writeText(readLogs());
    return { ok: true };
  });
  ipcMain.handle('logs:open', async () => {
    shell.showItemInFolder(logPath);
    return { ok: true, path: logPath };
  });

  // ---- player ----
  ipcMain.handle('player:getId', () => ({ id: getOrCreatePlayerId() }));

  // ---- сборка / обновления ----
  ipcMain.handle('app:buildInfo', () => {
    const read = (p: string) => {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
    };
    const packaged = path.join(__dirname, '../../public/build-info.json');
    const dev = path.join(__dirname, '../../public/build-info.json');
    const installed = read(packaged) ?? read(dev) ?? { version: app.getVersion(), builtAt: null, sourceHash: null };
    // Манифест последней сборки лежит рядом с установщиком в проекте
    const manifestPaths = [
      path.join(__dirname, '../../../release/latest.json'),
      path.join(process.cwd(), 'release/latest.json'),
      path.join(__dirname, '../../../release/latest.json')
    ];
    let latest: any = null;
    for (const p of manifestPaths) { const m = read(p); if (m) { latest = m; break; } }
    return { installed, latest, installerPath: path.join(process.cwd(), 'Rumblewersfad-Setup.exe') };
  });

  ipcMain.handle('app:openInstaller', () => {
    const p = path.join(process.cwd(), 'Rumblewersfad-Setup.exe');
    if (fs.existsSync(p)) { shell.showItemInFolder(p); return { ok: true, path: p }; }
    return { ok: false, error: 'Installer not found' };
  });

  // ---- settings ----
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    if (patch && typeof patch === 'object') {
      if ('autoStart' in patch) {
        app.setLoginItemSettings({ openAtLogin: !!patch.autoStart });
      }
    }
    const next = setSettings(patch ?? {});
    send(win(), 'settings:changed', next);
    return next;
  });

  // ---- local data (providers' storage) ----
  ipcMain.handle('data:matches', () => store.get('matches', []));
  ipcMain.handle('data:matches:set', (_e, v: unknown[]) => {
    store.set('matches', Array.isArray(v) ? v : []);
    return store.get('matches');
  });
  ipcMain.handle('data:friends', () => store.get('friends', []));
  ipcMain.handle('data:friends:set', (_e, v: unknown[]) => {
    store.set('friends', Array.isArray(v) ? v : []);
    return store.get('friends');
  });
  ipcMain.handle('data:requests', () => store.get('friendRequests', []));
  ipcMain.handle('data:requests:set', (_e, v: unknown[]) => {
    store.set('friendRequests', Array.isArray(v) ? v : []);
    return store.get('friendRequests');
  });
  ipcMain.handle('data:blocked', () => store.get('blocked', []));
  ipcMain.handle('data:blocked:add', (_e, name: string) => {
    const list = new Set<string>(store.get('blocked', []) as string[]);
    list.add(name);
    store.set('blocked', [...list]);
    return store.get('blocked');
  });
  ipcMain.handle('data:blocked:remove', (_e, name: string) => {
    const list = (store.get('blocked', []) as string[]).filter((n) => n !== name);
    store.set('blocked', list);
    return store.get('blocked');
  });
  ipcMain.handle('data:reset', () => {
    store.clear();
    return { ok: true };
  });

  // ---- news ----
  ipcMain.handle('news:get', async () => {
    const s = getSettings();
    const fallback = path.join(__dirname, '../../public/news.json');
    const src = s.newsUrl || `file://${fallback.replace(/\\/g, '/')}`;
    try {
      if (src.startsWith('http')) {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      }
      const p = src.replace(/^file:\/\//, '');
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (err: any) {
      log(`news fetch failed: ${err?.message}`, 'warn');
      try {
        return JSON.parse(fs.readFileSync(fallback, 'utf8'));
      } catch {
        return [];
      }
    }
  });
}
