/* ---------------------------------------------------------------------------
 * COMMUNITY CLIENT (main process)
 * - поднимает встроенный сервер присутствия, если включено
 * - шлёт heartbeat с РЕАЛЬНЫМ статусом (inGame, только когда игра запущена)
 * - проксирует запросы рендерера к серверу (CSP не пускает file:// в сеть
 *   напрямую, плюс так мы не светим токен в рендерере)
 * - разбирает deep link rumblewersfad://invite/CODE
 * ------------------------------------------------------------------------- */
import { app, ipcMain, BrowserWindow } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { store, getSettings, getOrCreateClientUid, getOrCreatePlayerId, setSettings } from './store.js';
import { getGameStatus } from './game.js';
import { startPresenceServer, type PresenceServerHandle, type PlayerStatus } from './presenceServer.js';
import {
  startGameNetwork, restartGameNetwork, getGameNetworkState, getGamePlayers,
  setGameNetworkUpdateHandler, scanGameLogs, type GamePlayer
} from './gameNetwork.js';
import { log } from './logs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HEARTBEAT_MS = 12_000;
const REQUEST_TIMEOUT = 6_000;
export const INVITE_SCHEME = 'rumblewersfad';

let hosted: PresenceServerHandle | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let getWin: () => BrowserWindow | null = () => null;
let pendingInvite: string | null = null;
let lastStatus: { online: number; reachable: boolean; url: string } = { online: 0, reachable: false, url: '' };

/** Базовый URL: явный из настроек, иначе локальный встроенный сервер. */
export function communityBaseUrl(): string {
  const s = getSettings();
  const custom = (s.communityUrl ?? '').trim().replace(/\/+$/, '');
  if (custom) return custom;
  return `http://127.0.0.1:${s.communityPort || 8787}`;
}

function headers(): Record<string, string> {
  const s = getSettings();
  const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-Player-Uid': getOrCreateClientUid() };
  if (s.communityToken) h['X-Community-Token'] = s.communityToken;
  return h;
}

/** Поиск по нику / #ID / cozmo_id / uid / детали источника. */
function matches(p: { nickname?: string; playerId?: string; uid?: string; detail?: string }, q: string): boolean {
  return [p.nickname, p.playerId, p.uid, p.detail]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}

async function call<T>(route: string, init: RequestInit = {}): Promise<T> {
  const url = communityBaseUrl() + route;
  // Один ретрай: после рестарта сервера (смена LAN/VPS, переподнятие хоста)
  // в пуле undici может остаться мёртвый keep-alive сокет → ECONNRESET.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...headers(), ...(init.headers as Record<string, string> ?? {}) },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 120));
    }
  }
  throw lastErr;
}

function post<T>(route: string, body: unknown): Promise<T> {
  return call<T>(route, { method: 'POST', body: JSON.stringify(body) });
}

/** Текущее присутствие: статус берётся из реального процесса игры. */
function presencePayload() {
  const s = getSettings();
  const st = getGameStatus();
  const gamePid = st.running && st.pid ? st.pid : null;
  return {
    uid: getOrCreateClientUid(),
    playerId: getOrCreatePlayerId(),
    nickname: (s.profileName || 'Player').slice(0, 24),
    region: s.region,
    gamePid,
    status: (gamePid ? 'inGame' : 'online') as PlayerStatus
  };
}

async function heartbeat(forceStatus?: PlayerStatus): Promise<void> {
  const s = getSettings();
  const base = communityBaseUrl();
  try {
    if (!s.presenceVisible) {
      // opt-out: убираем себя из «онлайна», но сервер не дёргаем лишний раз
      lastStatus = { ...lastStatus, reachable: true, url: base };
      return;
    }
    const payload = presencePayload();
    if (forceStatus) payload.status = forceStatus;
    const r = await post<{ ok: boolean; online?: number }>('/presence', payload);
    lastStatus = { online: r.online ?? 0, reachable: true, url: base };
  } catch (e: any) {
    lastStatus = { online: 0, reachable: false, url: base };
    log(`community heartbeat failed: ${e?.message ?? e}`, 'warn');
  }
  emitUpdate();
}

function emitUpdate() {
  const w = getWin();
  if (w && !w.isDestroyed()) w.webContents.send('community:update', lastStatus);
}

/** Поднимаем встроенный сервер, только если используем локальный URL. */
async function ensureHost(): Promise<void> {
  const s = getSettings();
  if (!s.communityHost) return;
  if ((s.communityUrl ?? '').trim()) return; // внешний сервер — свой не нужен
  if (hosted) return;
  const dataFile = path.join(app.getPath('userData'), 'community-data.json');
  const host = s.communityLan ? '0.0.0.0' : '127.0.0.1';
  try {
    hosted = await startPresenceServer({
      port: s.communityPort || 8787,
      host,
      dataFile,
      token: s.communityToken || ''
    });
    log(`community server started on ${host}:${hosted.port}`);
  } catch (e: any) {
    // Порт занят — значит уже запущен другой экземпляр лаунчера, это нормально
    log(`community server not hosted (${e?.code ?? e?.message ?? e}); using existing`, 'warn');
  }
}

/** Разбор ссылки вида rumblewersfad://invite/CODE или https://host/i/CODE */
export function parseInvite(input: string): string | null {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  let m = s.match(/^rumblewersfad:\/\/invite\/([A-Za-z0-9_-]{4,32})/i);
  if (m) return m[1];
  m = s.match(/^rumblewersfad:\/\/add\/([A-Za-z0-9_-]{4,32})/i);
  if (m) return m[1];
  m = s.match(/\/i\/([A-Za-z0-9_-]{4,32})(?:\?|#|$)/i);
  if (m) return m[1];
  // Голый код
  if (/^[A-Za-z0-9_-]{4,32}$/.test(s)) return s;
  return null;
}

/** Пришло приглашение (deep link / второй экземпляр). */
export function receiveInvite(raw: string): void {
  const code = parseInvite(raw);
  if (!code) return;
  pendingInvite = code;
  log(`community invite received: ${code}`);
  const w = getWin();
  if (w && !w.isDestroyed()) w.webContents.send('community:invite', code);
}

export function takePendingInvite(): string | null {
  const c = pendingInvite;
  pendingInvite = null;
  return c;
}

function self() {
  return { uid: getOrCreateClientUid(), playerId: getOrCreatePlayerId() };
}

/** Все IPC-каналы сообщества. */
export function registerCommunityIpc(getWindow: () => BrowserWindow | null): void {
  getWin = getWindow;

  ipcMain.handle('community:status', async () => ({
    ...lastStatus,
    ...self(),
    hosting: !!hosted,
    lanIp: localIpHint(),
    lanPort: getSettings().communityPort || 8787,
    inviteScheme: INVITE_SCHEME
  }));

  /** Объединённый каталог: сервер сообщества + реальные игроки из файлов игры
   *  + локальные друзья. Работает ДАЖЕ если сервер присутствия недоступен. */
  ipcMain.handle('community:directory', async (_e, q?: string) => {
    const query = (typeof q === 'string' ? q : '').trim().toLowerCase();
    const merged = new Map<string, any>();

    // 1) Живые лаунчеры (presence server)
    try {
      const r = await call<{ players: any[] }>('/directory?q=' + encodeURIComponent(query));
      for (const p of r.players ?? []) {
        if (p?.uid) merged.set(p.uid, { ...p, source: 'presence' });
      }
    } catch { /* сервер недоступен — продолжаем с другими источниками */ }

    // 2) Реальные игроки из игры (guest-аккаунт, серверы, логи матчей, мост)
    //    Перед чтением каталога — свежее сканирование логов игры.
    try { scanGameLogs(); } catch { /* ignore */ }
    const gp = getGamePlayers();
    for (const p of gp) {
      if (query && !matches(p, query)) continue;
      merged.set(p.uid, { ...p, source: p.source });
    }

    // 3) Локально добавленные друзья — чтобы поиск никогда не был пустым
    try {
      const local = store.get('friends', []) as any[];
      for (const f of local) {
        if (!f) continue;
        const uid = String(f.id ?? f.uid ?? ('local-' + String(f.nickname ?? '').toLowerCase()));
        if (merged.has(uid)) continue;
        const candidate = {
          uid, playerId: f.playerId ?? '—', nickname: String(f.nickname ?? 'Player'),
          status: f.status ?? 'offline', source: 'local',
          lastSeen: Date.now(), avatarColor: f.avatarColor ?? '#8B5CF6'
        };
        if (!query || matches(candidate, query)) merged.set(uid, candidate);
      }
    } catch { /* ignore */ }

    const rank: Record<string, number> = { inGame: 0, online: 1, offline: 2 };
    return [...merged.values()].sort((a, b) =>
      (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || (b.lastSeen ?? 0) - (a.lastSeen ?? 0)
    );
  });

  ipcMain.handle('community:gameState', () => getGameNetworkState());
  ipcMain.handle('community:gameRefresh', async () => {
    restartGameNetwork();
    await new Promise((r) => setTimeout(r, 900));
    return getGameNetworkState();
  });
  ipcMain.handle('community:gameConfig', async (_e, patch: { gameNetworkEnabled?: boolean; gameLauncherToken?: string; gameBridgePort?: number }) => {
    const p = patch ?? {};
    if (typeof p.gameLauncherToken === 'string') {
      setSettings({ gameLauncherToken: p.gameLauncherToken.slice(0, 256) });
    }
    if (typeof p.gameNetworkEnabled === 'boolean') setSettings({ gameNetworkEnabled: p.gameNetworkEnabled });
    if (typeof p.gameBridgePort === 'number' && p.gameBridgePort > 0 && p.gameBridgePort < 65536) {
      setSettings({ gameBridgePort: Math.floor(p.gameBridgePort) });
    }
    restartGameNetwork();
    return getGameNetworkState();
  });

  ipcMain.handle('community:heartbeat', async (_e, status?: PlayerStatus) => {
    await heartbeat(status);
    return lastStatus;
  });

  ipcMain.handle('community:invite:create', async () => {
    const r = await post<{ ok: boolean; code: string; expiresAt: number }>('/invites', { uid: self().uid });
    const s = getSettings();
    // Для веб-ссылки нужен адрес, доступный другим, а не 127.0.0.1
    const publicBase = (s.communityUrl || '').trim().replace(/\/+$/, '')
      || (s.communityLan ? `http://${localIpHint()}:${s.communityPort || 8787}` : communityBaseUrl());
    return {
      code: r.code,
      deepLink: `${INVITE_SCHEME}://invite/${r.code}`,
      webLink: `${publicBase}/i/${r.code}`,
      expiresAt: r.expiresAt
    };
  });

  ipcMain.handle('community:invite:resolve', async (_e, raw: string) => {
    const code = parseInvite(String(raw ?? ''));
    if (!code) throw new Error('Invalid invite code');
    return await call<unknown>(`/invites/${code}`);
  });

  ipcMain.handle('community:invite:redeem', async (_e, raw: string) => {
    const code = parseInvite(String(raw ?? ''));
    if (!code) throw new Error('Invalid invite code');
    return await post<unknown>(`/invites/${code}/redeem`, { uid: self().uid });
  });

  ipcMain.handle('community:friends', async () => {
    try { return await call<unknown[]>(`/friends?uid=${encodeURIComponent(self().uid)}`); }
    catch { return []; }
  });

  ipcMain.handle('community:friend:add', async (_e, targetUid: string) => {
    const uid = String(targetUid ?? '');
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(uid)) throw new Error('Invalid player');
    return await post<unknown[]>(`/friends?uid=${encodeURIComponent(self().uid)}`, { uid: self().uid, targetUid: uid });
  });

  ipcMain.handle('community:friend:remove', async (_e, targetUid: string) => {
    const uid = String(targetUid ?? '');
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(uid)) throw new Error('Invalid player');
    return await call<unknown[]>(`/friends/${uid}?uid=${encodeURIComponent(self().uid)}`, { method: 'DELETE' });
  });

  ipcMain.handle('community:requests', async () => {
    try { return await call<unknown[]>(`/friends/requests?uid=${encodeURIComponent(self().uid)}`); }
    catch { return []; }
  });

  ipcMain.handle('community:request:send', async (_e, targetUid: string) => {
    const uid = String(targetUid ?? '');
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(uid)) throw new Error('Invalid player');
    return await post<unknown>(`/friends/requests?uid=${encodeURIComponent(self().uid)}`, { fromUid: self().uid, toUid: uid });
  });

  ipcMain.handle('community:request:resolve', async (_e, id: string, accept: boolean) => {
    const rid = String(id ?? '');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(rid)) throw new Error('Invalid request');
    return await post<unknown>(`/friends/requests/${rid}/${accept ? 'accept' : 'decline'}?uid=${encodeURIComponent(self().uid)}`, {});
  });

  ipcMain.handle('community:invite:pending', () => takePendingInvite());
  ipcMain.handle('community:invite:clear', () => { pendingInvite = null; return { ok: true }; });

  ipcMain.handle('community:setVisible', async (_e, visible: boolean) => {
    setSettings({ presenceVisible: !!visible });
    await heartbeat();
    return getSettings();
  });

  ipcMain.handle('community:restartHost', async () => {
    try { await hosted?.close(); } catch { /* ignore */ }
    hosted = null;
    await ensureHost();
    await heartbeat();
    return { ok: true, hosting: !!hosted, url: communityBaseUrl() };
  });
}

/** Старт: поднимаем сервер, регистрируем протокол, запускаем heartbeat. */
export async function startCommunity(): Promise<void> {
  await ensureHost();
  await heartbeat();

  // Источник реальных игроков из игры: guest-аккаунт, логи матчей, мост, WS
  setGameNetworkUpdateHandler(() => {
    const w = getWin();
    if (w && !w.isDestroyed()) w.webContents.send('community:gameUpdate', getGameNetworkState());
  });
  void startGameNetwork().catch((e) => log(`game network start failed: ${e?.message ?? e}`, 'warn'));
  const gameTimer = setInterval(() => {
    void import('./gameNetwork.js').then((m) => { m.scanGameLogs(); m.probeGameBridge(); });
  }, 60_000);
  gameTimer.unref?.();

  heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_MS);
  heartbeatTimer.unref?.();

  // second-instance обрабатывается в main.ts (там же фокусируем окно).
  // Здесь — только macOS, где ссылки приходят событием open-url.
  app.on('open-url', (e, url) => { e.preventDefault(); receiveInvite(url); });
  // Холодный старт по ссылке
  for (const a of process.argv) if (a.startsWith(INVITE_SCHEME + '://')) receiveInvite(a);

  try {
    if (!app.isPackaged) {
      app.setAsDefaultProtocolClient(INVITE_SCHEME, process.execPath, [path.resolve(__dirname, '../..')]);
    } else {
      app.setAsDefaultProtocolClient(INVITE_SCHEME);
    }
  } catch (e: any) {
    log(`protocol registration skipped: ${e?.message ?? e}`, 'warn');
  }
}

export function stopCommunity(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  void import('./gameNetwork.js').then((m) => m.stopLauncherWs());
  void hosted?.close().catch(() => { /* ignore */ });
  hosted = null;
}

/** Сразу обновляем статус, когда игра запустилась/закрылась. */
export function notifyGameStatus(): void {
  void heartbeat();
}

export function localIpHint(): string {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] ?? []) {
      if (n.family === 'IPv4' && !n.internal) return n.address;
    }
  }
  return '127.0.0.1';
}
