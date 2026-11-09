/* ---------------------------------------------------------------------------
 * GAME NETWORK — источник РЕАЛЬНЫХ игроков из файлов игры.
 *
 * Что реально нашлось в Rumbleverse-client (анализ бинарников / логов):
 *  - Rumbleverse/Binaries/Win64/Client.dll (патч rVclient): "Backend friend
 *    roster refreshed", {"guest_id":"...","guest_name":"..."}, "friends",
 *    "sent_requests", "cozmo_id" -> живой список друзей из бэкенда.
 *  - Публичный REST: POST https://game.rvclient.com/accounts/authenticate-guest
 *    {"guest_id","guest_name"} -> {cozmo_id, username, token} (РЕАЛЬНЫЙ аккаунт).
 *  - WS wss://api.rvclient.com : {"type":"hello"} ->
 *    {"type":"login","username","token","machine":"rvclient-dll"} ->
 *    {"type":"get_server_status"} -> server_status { servers:[...players...],
 *    total_players, lobby_players, match_players, ownerName }.
 *    Без токена лаунчера rVclient бэкенд отвечает login_unknown — мы НЕ
 *    обходим авторизацию: токен вводится пользователем в Настройках.
 *  - Локальный мост rVclient: 127.0.0.1:<-RVBridgePort>, команды
 *    COMMUNITY_STATUS / REFRESH / RETRYAUTH, кадры SELF|, SRV|, STATE|...
 *  - В логах матчей Client.dll пишет ростеры с именами игроков.
 *
 * Модуль НИКОГДА не ломает игру: всё read-only, с таймаутами и мягким
 * фолбэком. Результаты сливаются в каталог сообщества с меткой source.
 * ------------------------------------------------------------------------- */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { getSettings, getOrCreateClientUid, getOrCreatePlayerId, setSettings } from './store.js';
import { log } from './logs.js';

const COZMO = 'https://game.rvclient.com';
const LAUNCHER_WS = 'wss://api.rvclient.com';
const HTTP_TIMEOUT = 8_000;

export type PlayerSource = 'presence' | 'game' | 'server' | 'log' | 'local';

export interface GamePlayer {
  uid: string;
  playerId: string;
  nickname: string;
  status: 'online' | 'inGame' | 'offline';
  source: PlayerSource;
  detail?: string;
  lastSeen: number;
  avatarColor?: string;
}

export interface GameIdentity {
  ok: boolean;
  cozmoId?: string;
  username?: string;
  guestId?: string;
  error?: string;
}

export interface GameNetworkState {
  identity: GameIdentity;
  wsConnected: boolean;
  totalPlayers: number | null;
  bridgeConnected: boolean;
  lastError?: string;
  lastUpdate: number;
}

let identityCache: GameIdentity = { ok: false };
let identityCheckedAt = 0;
let gamePlayers = new Map<string, GamePlayer>();
let ws: WebSocket | null = null;
let wsTimer: NodeJS.Timeout | null = null;
let totalPlayers: number | null = null;
let bridgeConnected = false;
let lastError: string | undefined;
let onUpdate: (() => void) | null = null;

const AVATAR = ['#8B5CF6', '#A78BFA', '#6D28D9', '#C4B5FD', '#7C3AED', '#9F7AEA'];
const colorFor = (s: string) => AVATAR[(s.charCodeAt(0) || 0) % AVATAR.length];

function clean(v: unknown, max = 32): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

function stableGuestId(): string {
  // Стабильный guest_id из clientUid (бэкенд требует строку, а не UUID с дефисами? — ок)
  return 'rwf-' + getOrCreateClientUid().replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
}

function push(p: GamePlayer) {
  const prev = gamePlayers.get(p.uid);
  gamePlayers.set(p.uid, { ...prev, ...p });
  onUpdate?.();
}

export function setGameNetworkUpdateHandler(fn: (() => void) | null) { onUpdate = fn; }

export function getGameNetworkState(): GameNetworkState {
  return {
    identity: identityCache,
    wsConnected: !!ws && ws.readyState === 1,
    totalPlayers,
    bridgeConnected,
    lastError,
    lastUpdate: Date.now()
  };
}

export function getGamePlayers(): GamePlayer[] {
  return [...gamePlayers.values()];
}

/* -------------------------------------------------------------------------- */
/* 1. Публичный guest auth — даёт РЕАЛЬНЫЙ cozmo_id и имя в игре               */
/* -------------------------------------------------------------------------- */
export async function ensureGameIdentity(force = false): Promise<GameIdentity> {
  const s = getSettings();
  if (!s.gameNetworkEnabled) {
    identityCache = { ok: false, error: 'disabled' };
    return identityCache;
  }
  if (!force && identityCache.ok && Date.now() - identityCheckedAt < 10 * 60_000) return identityCache;

  const guestId = stableGuestId();
  const guestName = clean(s.profileName || 'Player', 24) || 'Player';
  try {
    const res = await fetch(COZMO + '/accounts/authenticate-guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_id: guestId, guest_name: guestName }),
      signal: AbortSignal.timeout(HTTP_TIMEOUT)
    });
    const j = await res.json() as Record<string, unknown>;
    identityCheckedAt = Date.now();
    if (j && j.success === true) {
      identityCache = {
        ok: true,
        cozmoId: clean(j.cozmo_id, 48) || undefined,
        username: clean(j.username, 32) || guestName,
        guestId
      };
      // Сам игрок — реальный аккаунт в игре, сразу виден в поиске
      push({
        uid: 'game-' + (identityCache.cozmoId ?? guestId),
        playerId: identityCache.cozmoId ?? getOrCreatePlayerId(),
        nickname: identityCache.username ?? guestName,
        status: 'online',
        source: 'game',
        detail: 'guest account',
        lastSeen: Date.now(),
        avatarColor: colorFor(identityCache.username ?? guestName)
      });
      log(`game identity ok: ${identityCache.cozmoId} / ${identityCache.username}`);
    } else {
      identityCache = { ok: false, guestId, error: clean(j?.error, 120) || `HTTP ${res.status}` };
      lastError = identityCache.error;
      log(`game identity failed: ${identityCache.error}`, 'warn');
    }
  } catch (e: any) {
    identityCache = { ok: false, guestId, error: e?.message ?? 'network error' };
    lastError = identityCache.error;
    log(`game identity error: ${lastError}`, 'warn');
  }
  return identityCache;
}

/* -------------------------------------------------------------------------- */
/* 2. WS лаунчера: реальные серверы и счётчики игроков (нужен токен rVclient)  */
/* -------------------------------------------------------------------------- */
function ingestServerStatus(msg: Record<string, any>) {
  if (typeof msg.total_players === 'number') totalPlayers = msg.total_players;
  const servers = Array.isArray(msg.servers) ? msg.servers : [];
  let count = 0;
  for (const srv of servers) {
    if (!srv || typeof srv !== 'object') continue;
    const n = Number(srv.players ?? srv.lobby_players ?? srv.match_players ?? 0);
    if (n > 0) count += n;
    const owner = clean(srv.ownerName ?? srv.owner ?? srv.name, 48);
    if (owner) {
      push({
        uid: 'server-' + (clean(srv.key ?? srv.address ?? srv.name, 48) || String(count)),
        playerId: String(n),
        nickname: owner,
        status: 'inGame',
        source: 'server',
        detail: `${n} ${clean(srv.region_name ?? srv.region, 24) || 'players'} · ${clean(srv.mode ?? srv.label, 24) || 'lobby'}`,
        lastSeen: Date.now(),
        avatarColor: colorFor(owner)
      });
    }
  }
  if (totalPlayers == null && count > 0) totalPlayers = count;
  onUpdate?.();
}

export function startLauncherWs(): void {
  stopLauncherWs();
  const s = getSettings();
  const token = (s.gameLauncherToken ?? '').trim();
  if (!s.gameNetworkEnabled || !token) return;

  try {
    const socket = new WebSocket(LAUNCHER_WS);
    ws = socket;
    const username = clean(s.profileName || 'Player', 24) || 'Player';

    socket.addEventListener('open', () => { lastError = undefined; });
    socket.addEventListener('message', (ev) => {
      let msg: any;
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg?.type === 'hello') {
        socket.send(JSON.stringify({ type: 'login', username, token, machine: 'rvclient-dll' }));
      } else if (msg?.type === 'login_ok' || msg?.type === 'authenticated') {
        socket.send(JSON.stringify({ type: 'get_server_status' }));
      } else if (msg?.type === 'login_unknown' || msg?.type === 'login_rejected') {
        lastError = 'Launcher token rejected by game backend';
        log(`launcher WS ${msg.type}`, 'warn');
      } else if (msg?.type === 'server_status' || msg?.type === 'server_pings') {
        ingestServerStatus(msg);
      } else if (msg?.type === 'error') {
        lastError = clean(msg.error, 120);
      }
    });
    socket.addEventListener('error', () => { lastError = 'Launcher WS unreachable'; });
    socket.addEventListener('close', () => { if (ws === socket) ws = null; });

    // Периодический опрос статуса, пока соединение живо
    wsTimer = setInterval(() => {
      if (ws === socket && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'get_server_status' }));
      }
    }, 20_000);
    wsTimer.unref?.();
  } catch (e: any) {
    lastError = e?.message ?? 'WS failed';
    log(`launcher WS start failed: ${lastError}`, 'warn');
  }
}

export function stopLauncherWs(): void {
  if (wsTimer) { clearInterval(wsTimer); wsTimer = null; }
  if (ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
}

/* -------------------------------------------------------------------------- */
/* 3. Локальный мост rVclient (read-only, best effort)                        */
/* -------------------------------------------------------------------------- */
function parseBridgeLine(line: string) {
  const t = line.trim();
  if (!t) return;
  // JSON-кадры с ростером
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      const roster = j.roster ?? j.players ?? j.friends;
      if (Array.isArray(roster)) {
        for (const p of roster) {
          const name = clean(p?.name ?? p?.nickname ?? p?.username, 32);
          if (!name) continue;
          push({
            uid: 'bridge-' + (clean(p.id ?? p.cozmo_id ?? name, 48)),
            playerId: clean(p.playerId ?? p.id, 20) || '—',
            nickname: name,
            status: p.online === false ? 'offline' : 'inGame',
            source: 'log',
            detail: 'game bridge',
            lastSeen: Date.now(),
            avatarColor: colorFor(name)
          });
        }
      }
    } catch { /* не JSON — игнорируем */ }
    return;
  }
  // SELF|имя / SRV|...|имя
  const m = t.match(/^(?:SELF|MSG|NEAR)\|([^|]{2,32})/i);
  if (m) {
    const name = clean(m[1], 32);
    push({
      uid: 'bridge-' + name.toLowerCase(),
      playerId: '—',
      nickname: name,
      status: 'inGame',
      source: 'log',
      detail: 'local bridge',
      lastSeen: Date.now(),
      avatarColor: colorFor(name)
    });
  }
}

export function probeGameBridge(port?: number): void {
  const s = getSettings();
  if (!s.gameNetworkEnabled) return;
  const p = port || s.gameBridgePort || 47818;
  const sock = new net.Socket();
  let buf = '';
  let settled = false;
  const finish = (connected: boolean) => {
    if (settled) return;
    settled = true;
    bridgeConnected = connected;
    try { sock.destroy(); } catch { /* ignore */ }
    onUpdate?.();
  };
  sock.setTimeout(1200);
  sock.on('connect', () => {
    finish(true);
    // Только читаем. COMMUNITY_STATUS — штатная команда обновления статуса.
    try { sock.write('COMMUNITY_STATUS\n'); } catch { /* ignore */ }
  });
  sock.on('data', (d) => {
    buf += d.toString('utf8');
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const l of lines) parseBridgeLine(l);
  });
  sock.on('timeout', () => finish(bridgeConnected));
  sock.on('error', () => finish(false));
  sock.on('close', () => finish(false));
  try { sock.connect(p, '127.0.0.1'); } catch { finish(false); }
}

/* -------------------------------------------------------------------------- */
/* 4. Имена реальных игроков из логов матчей / реплеев игры                   */
/* -------------------------------------------------------------------------- */
const NAME_PATTERNS: RegExp[] = [
  /"guest_name"\s*:\s*"([^"]{2,32})"/g,
  /"name"\s*:\s*"([^"]{2,32})"/g,
  /LOBBYNAME local player name set to the account name '([^']{2,32})'/g,
  /REPLAYROSTER[^\n]*?"name"\s*:\s*"([^"]{2,32})"/g,
  /StartStreaming[^\n]*?[?&]user=([A-Za-z0-9-]{6,48})/g
];
const SKIP_NAMES = new Set([
  'player', 'players', 'name', 'bot', 'none', 'unknown', 'test', 'default',
  'rumbleverse', 'frontend', 'menu', 'lobby', 'server', 'local player'
]);

export function scanGameLogs(): number {
  const s = getSettings();
  if (!s.gameNetworkEnabled || !s.gameFolder) return 0;
  const roots = [
    path.join(s.gameFolder, 'Rumbleverse', 'Saved', 'Logs'),
    path.join(s.gameFolder, 'Rumbleverse', 'UserReplayWindow', 'Saved', 'Logs'),
    path.join(s.gameFolder, 'Rumbleverse', 'Binaries', 'Win64'),
    path.join(s.gameFolder, 'Rumbleverse', 'UserReplayWindow', 'Saved', 'SaveGames')
  ];
  const files: string[] = [];
  for (const root of roots) {
    try {
      for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        if (!e.isFile()) continue;
        if (!/\.(log|txt|json|ini)$/i.test(e.name)) continue;
        const full = path.join(root, e.name);
        if (fs.statSync(full).size > 8 * 1024 * 1024) continue;
        files.push(full);
      }
    } catch { /* папки может не быть */ }
  }

  let found = 0;
  for (const f of files) {
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const re of NAME_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const name = clean(m[1], 32);
        if (!name || SKIP_NAMES.has(name.toLowerCase())) continue;
        if (/^[0-9a-f-]{20,}$/i.test(name)) continue; // это ID, не ник
        push({
          uid: 'log-' + name.toLowerCase(),
          playerId: '—',
          nickname: name,
          status: 'offline',
          source: 'log',
          detail: 'seen in match log',
          lastSeen: Date.now(),
          avatarColor: colorFor(name)
        });
        found++;
        if (found > 120) break;
      }
      if (found > 120) break;
    }
    if (found > 120) break;
  }
  if (found) log(`game log scan: ${found} player name(s) discovered`);
  return found;
}

/* -------------------------------------------------------------------------- */
/* Старт / рестарт                                                            */
/* -------------------------------------------------------------------------- */
export async function startGameNetwork(): Promise<void> {
  await ensureGameIdentity();
  scanGameLogs();
  probeGameBridge();
  startLauncherWs();
}

export function restartGameNetwork(): void {
  gamePlayers = new Map();
  totalPlayers = null;
  lastError = undefined;
  identityCheckedAt = 0;
  void startGameNetwork();
}

export function applyGameNetworkSettings(patch: { gameNetworkEnabled?: boolean; gameLauncherToken?: string; gameBridgePort?: number }) {
  setSettings(patch);
  restartGameNetwork();
}

export function getGamePlayerId(): string { return getOrCreatePlayerId(); }
