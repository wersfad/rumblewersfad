/* ---------------------------------------------------------------------------
 * PRESENCE SERVER — каталог «живых» игроков лаунчера
 *
 * Нулевые внешние зависимости: только node:http / crypto / fs.
 * Один и тот же модуль используется двумя способами:
 *   1) Встроенно в Electron main (startPresenceServer) — работает «из коробки».
 *   2) Как отдельный сервер: `node server/index.mjs` — выкладываем на VPS,
 *      и все лаунчеры указывают его URL в Настройках.
 *
 * Игроки РЕАЛЬНЫЕ: каждый запущенный лаунчер шлёт heartbeat; статус
 * inGame выставляется только когда процесс игры действительно запущен.
 * ------------------------------------------------------------------------- */
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type PlayerStatus = 'online' | 'inGame' | 'offline';

export interface DirectoryEntry {
  uid: string;
  playerId: string;
  nickname: string;
  status: PlayerStatus;
  region?: string;
  lastSeen: number;
  gamePid?: number | null;
}

export interface FriendLink {
  uid: string;
  playerId: string;
  nickname: string;
  status: PlayerStatus;
  avatarColor?: string;
}

export interface FriendReq {
  id: string;
  fromUid: string;
  fromNickname: string;
  fromPlayerId: string;
  toUid: string;
  createdAt: number;
  status: 'pending' | 'accepted' | 'declined';
}

interface Invite {
  code: string;
  uid: string;
  createdAt: number;
  expiresAt: number;
  uses: number;
  maxUses: number;
}

interface Persisted {
  directory: Record<string, DirectoryEntry>;
  friends: Record<string, string[]>;
  requests: Record<string, FriendReq>;
  blocked: Record<string, string[]>;
  invites: Record<string, Invite>;
}

export interface PresenceServerOptions {
  port?: number;
  host?: string;
  dataFile?: string;
  token?: string;
}

export interface PresenceServerHandle {
  port: number;
  host: string;
  /** Закрывает сервер и все keep-alive соединения; резолвится, когда порт свободен. */
  close: () => Promise<void>;
  hub: CommunityHub;
}

const ONLINE_TTL = 40_000;       // heartbeat каждые 12с → 40с без весточки = офлайн
const INVITE_TTL = 7 * 24 * 3600_000;
const INVITE_MAX_USES = 50;
const BODY_LIMIT = 16 * 1024;
const SAVE_DEBOUNCE = 600;

const AVATAR_COLORS = ['#8B5CF6', '#A78BFA', '#6D28D9', '#C4B5FD', '#7C3AED', '#9F7AEA'];
const colorFor = (s: string) => AVATAR_COLORS[(s.charCodeAt(0) || 0) % AVATAR_COLORS.length];

/** Безопасная строка: без управляющих символов, ограниченной длины. */
function clean(v: unknown, max = 48, fallback = ''): string {
  if (typeof v !== 'string') return fallback;
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max) || fallback;
}
function uidOf(v: unknown): string {
  const s = clean(v, 64);
  return /^[A-Za-z0-9_-]{6,64}$/.test(s) ? s : '';
}

export class CommunityHub {
  private live = new Map<string, { status: PlayerStatus; lastSeen: number; gamePid: number | null; region?: string }>();
  private data: Persisted = { directory: {}, friends: {}, requests: {}, blocked: {}, invites: {} };
  private sse = new Set<ServerResponse>();
  private ws = new Set<Socket>();
  private saveTimer: NodeJS.Timeout | null = null;
  private gcTimer: NodeJS.Timeout | null = null;
  private rate = new Map<string, { n: number; reset: number }>();

  constructor(private dataFile: string) {
    this.load();
    this.gcTimer = setInterval(() => this.gc(), 10_000);
    this.gcTimer.unref?.();
  }

  /** Освобождаем таймеры, иначе процесс Electron не сможет корректно выйти. */
  dispose(): void {
    if (this.gcTimer) clearInterval(this.gcTimer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.gcTimer = null;
    this.saveTimer = null;
    this.listeners.clear();
  }

  // ---------- persistence ----------
  private load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.dataFile, 'utf8')) as Partial<Persisted>;
      this.data = {
        directory: raw.directory ?? {},
        friends: raw.friends ?? {},
        requests: raw.requests ?? {},
        blocked: raw.blocked ?? {},
        invites: raw.invites ?? {}
      };
    } catch { /* первый запуск / битый файл — стартуем с пустым */ }
  }
  private save() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
        const tmp = this.dataFile + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
        fs.renameSync(tmp, this.dataFile);
      } catch { /* диск недоступен — работаем в памяти */ }
    }, SAVE_DEBOUNCE);
    this.saveTimer.unref?.();
  }

  /** Простейший rate-limit: не более 90 записей в минуту с одного IP. */
  allow(ip: string): boolean {
    const now = Date.now();
    const r = this.rate.get(ip);
    if (!r || now > r.reset) { this.rate.set(ip, { n: 1, reset: now + 60_000 }); return true; }
    if (r.n >= 90) return false;
    r.n++; return true;
  }

  private gc() {
    const now = Date.now();
    let changed = false;
    for (const [uid, v] of this.live) if (now - v.lastSeen > ONLINE_TTL) { this.live.delete(uid); changed = true; }
    for (const [code, inv] of Object.entries(this.data.invites)) {
      if (inv.expiresAt < now || inv.uses >= inv.maxUses) { delete this.data.invites[code]; changed = true; }
    }
    if (changed) { this.save(); this.broadcast('presence'); }
  }

  // ---------- events ----------
  onEvent(cb: (name: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  private listeners = new Set<(name: string) => void>();
  broadcast(name: string) { for (const fn of this.listeners) fn(name); }

  addSse(res: ServerResponse) { this.sse.add(res); }
  removeSse(res: ServerResponse) { this.sse.delete(res); }
  addWs(s: Socket) { this.ws.add(s); }
  removeWs(s: Socket) { this.ws.delete(s); }

  pushSse(name: string) {
    const payload = `data: ${JSON.stringify({ type: name, at: Date.now() })}\n\n`;
    for (const res of this.sse) { try { res.write(payload); } catch { this.sse.delete(res); } }
  }
  pushWs(name: string) {
    const frame = wsTextFrame(JSON.stringify({ type: name, at: Date.now() }));
    for (const s of this.ws) { try { s.write(frame); } catch { this.ws.delete(s); } }
  }

  // ---------- presence ----------
  heartbeat(body: Record<string, unknown>): { ok: boolean; error?: string; self?: DirectoryEntry; online?: number } {
    const uid = uidOf(body.uid);
    if (!uid) return { ok: false, error: 'invalid uid' };
    const nickname = clean(body.nickname, 24, 'Player');
    const playerId = clean(body.playerId, 12, '???');
    const gamePid = typeof body.gamePid === 'number' ? body.gamePid : null;
    const status: PlayerStatus = gamePid && gamePid > 0 ? 'inGame' : 'online';
    const region = clean(body.region, 16, 'auto');

    this.live.set(uid, { status, lastSeen: Date.now(), gamePid, region });
    const entry: DirectoryEntry = {
      uid, playerId, nickname, status, region, lastSeen: Date.now(), gamePid
    };
    this.data.directory[uid] = entry;
    this.save();
    this.broadcast('presence');
    return { ok: true, self: entry, online: this.onlineCount() };
  }

  onlineCount(): number { return this.live.size; }

  statusOf(uid: string): PlayerStatus {
    const l = this.live.get(uid);
    return l ? l.status : 'offline';
  }

  directory(query = ''): DirectoryEntry[] {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const out: DirectoryEntry[] = Object.values(this.data.directory)
      .filter((e) => !q || e.nickname.toLowerCase().includes(q) || e.playerId.toLowerCase().includes(q) || e.uid.toLowerCase().includes(q))
      .map((e) => ({
        ...e,
        status: this.statusOf(e.uid),
        lastSeen: this.live.get(e.uid)?.lastSeen ?? e.lastSeen,
        // не показываем «призраков» старше 30 дней
      }))
      .filter((e) => now - e.lastSeen < 30 * 24 * 3600_000)
      .sort((a, b) => {
        const rank = (s: PlayerStatus) => (s === 'inGame' ? 0 : s === 'online' ? 1 : 2);
        return rank(a.status) - rank(b.status) || b.lastSeen - a.lastSeen;
      });
    return out;
  }

  // ---------- friends ----------
  private link(uid: string): FriendLink {
    const e = this.data.directory[uid];
    return {
      uid,
      playerId: e?.playerId ?? '???',
      nickname: e?.nickname ?? 'Player',
      status: this.statusOf(uid),
      avatarColor: colorFor(e?.nickname ?? uid)
    };
  }
  friends(uid: string): FriendLink[] {
    return (this.data.friends[uid] ?? []).map((f) => this.link(f));
  }
  addFriend(uid: string, targetUid: string): FriendLink[] {
    if (!uid || !targetUid || uid === targetUid) return this.friends(uid);
    const list = new Set(this.data.friends[uid] ?? []);
    list.add(targetUid);
    this.data.friends[uid] = [...list];
    this.save(); this.broadcast('friends');
    return this.friends(uid);
  }
  removeFriend(uid: string, targetUid: string): FriendLink[] {
    this.data.friends[uid] = (this.data.friends[uid] ?? []).filter((f) => f !== targetUid);
    this.save(); this.broadcast('friends');
    return this.friends(uid);
  }

  // ---------- requests ----------
  requests(uid: string): FriendReq[] {
    return Object.values(this.data.requests)
      .filter((r) => r.status === 'pending' && (r.fromUid === uid || r.toUid === uid))
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  createRequest(fromUid: string, toUid: string): { ok: boolean; error?: string; request?: FriendReq } {
    if (!fromUid || !toUid) return { ok: false, error: 'invalid uid' };
    if (fromUid === toUid) return { ok: false, error: 'cannot invite yourself' };
    const blocked = this.data.blocked[toUid] ?? [];
    if (blocked.includes(fromUid)) return { ok: false, error: 'blocked' };
    const dup = Object.values(this.data.requests).find(
      (r) => r.status === 'pending' && ((r.fromUid === fromUid && r.toUid === toUid) || (r.fromUid === toUid && r.toUid === fromUid))
    );
    if (dup) return { ok: true, request: dup };

    const from = this.data.directory[fromUid];
    const req: FriendReq = {
      id: crypto.randomUUID(),
      fromUid, toUid,
      fromNickname: from?.nickname ?? 'Player',
      fromPlayerId: from?.playerId ?? '???',
      createdAt: Date.now(),
      status: 'pending'
    };
    this.data.requests[req.id] = req;
    this.save(); this.broadcast('requests');
    return { ok: true, request: req };
  }
  resolveRequest(id: string, uid: string, accept: boolean): { ok: boolean; error?: string } {
    const r = this.data.requests[id];
    if (!r) return { ok: false, error: 'not found' };
    if (r.toUid !== uid) return { ok: false, error: 'forbidden' };
    r.status = accept ? 'accepted' : 'declined';
    if (accept) {
      for (const [a, b] of [[r.fromUid, r.toUid], [r.toUid, r.fromUid]]) {
        const set = new Set(this.data.friends[a] ?? []); set.add(b); this.data.friends[a] = [...set];
      }
    }
    this.save(); this.broadcast('requests'); this.broadcast('friends');
    return { ok: true };
  }

  // ---------- blocked ----------
  blocked(uid: string): string[] { return this.data.blocked[uid] ?? []; }
  block(uid: string, targetUid: string): string[] {
    const set = new Set(this.blocked(uid)); set.add(targetUid);
    this.data.blocked[uid] = [...set];
    this.data.friends[uid] = (this.data.friends[uid] ?? []).filter((f) => f !== targetUid);
    this.save(); this.broadcast('friends');
    return this.blocked(uid);
  }
  unblock(uid: string, targetUid: string): string[] {
    this.data.blocked[uid] = this.blocked(uid).filter((f) => f !== targetUid);
    this.save(); this.broadcast('friends');
    return this.blocked(uid);
  }

  // ---------- invites ----------
  createInvite(uid: string): Invite {
    // Одна активная ссылка на игрока
    for (const inv of Object.values(this.data.invites)) if (inv.uid === uid) delete this.data.invites[inv.code];
    const code = crypto.randomBytes(6).toString('base64url').slice(0, 10);
    const inv: Invite = { code, uid, createdAt: Date.now(), expiresAt: Date.now() + INVITE_TTL, uses: 0, maxUses: INVITE_MAX_USES };
    this.data.invites[code] = inv;
    this.save();
    return inv;
  }
  activeInvite(uid: string): Invite | undefined {
    return Object.values(this.data.invites).find((i) => i.uid === uid && i.expiresAt > Date.now() && i.uses < i.maxUses);
  }
  resolveInvite(code: string) {
    const inv = this.data.invites[code];
    if (!inv || inv.expiresAt < Date.now() || inv.uses >= inv.maxUses) return { ok: false, error: 'invalid or expired invite' };
    const e = this.data.directory[inv.uid];
    return {
      ok: true,
      from: { uid: inv.uid, playerId: e?.playerId ?? '???', nickname: e?.nickname ?? 'Player', status: this.statusOf(inv.uid) },
      expiresAt: inv.expiresAt
    };
  }
  redeemInvite(code: string, uid: string) {
    const inv = this.data.invites[code];
    if (!inv || inv.expiresAt < Date.now() || inv.uses >= inv.maxUses) return { ok: false, error: 'invalid or expired invite' };
    if (inv.uid === uid) return { ok: false, error: 'cannot redeem your own invite' };
    if ((this.data.blocked[inv.uid] ?? []).includes(uid)) return { ok: false, error: 'blocked' };
    inv.uses++;
    // Приглашение сразу создаёт встречную дружбу + уведомление-заявку
    const r = this.createRequest(uid, inv.uid);
    this.addFriend(uid, inv.uid);
    this.addFriend(inv.uid, uid);
    // autoriser: помечаем заявку принятой, чтобы не висела в "Заявках"
    if (r.request) this.data.requests[r.request.id].status = 'accepted';
    this.save(); this.broadcast('requests'); this.broadcast('friends');
    return { ok: true, friend: this.link(inv.uid) };
  }

  setStatus(uid: string, status: PlayerStatus): FriendLink {
    this.live.set(uid, { status, lastSeen: Date.now(), gamePid: status === 'inGame' ? 1 : null });
    const e = this.data.directory[uid];
    if (e) { e.status = status; e.lastSeen = Date.now(); }
    this.broadcast('presence');
    return this.link(uid);
  }
}

/** Минимальный WebSocket-кадр (сервер → клиент, без маски). */
function wsTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let head: Buffer;
  if (len < 126) { head = Buffer.from([0x81, len]); }
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}

export async function startPresenceServer(opts: PresenceServerOptions = {}): Promise<PresenceServerHandle> {
  const port = opts.port ?? 8787;
  const host = opts.host ?? '127.0.0.1';
  const dataFile = opts.dataFile ?? path.join(process.cwd(), 'community-data.json');
  const token = opts.token ?? '';
  const hub = new CommunityHub(dataFile);

  hub.onEvent((name) => { hub.pushSse(name); hub.pushWs(name); });

  const send = (res: ServerResponse, code: number, body: unknown) => {
    const buf = Buffer.from(JSON.stringify(body), 'utf8');
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': buf.length,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Community-Token, X-Player-Uid',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  };

  const readBody = (req: IncomingMessage): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (c: Buffer) => {
        raw += c.toString('utf8');
        if (raw.length > BODY_LIMIT) { reject(new Error('body too large')); req.destroy(); }
      });
      req.on('end', () => {
        if (!raw) return resolve({});
        try { const p = JSON.parse(raw); resolve(p && typeof p === 'object' ? p : {}); }
        catch { reject(new Error('invalid JSON')); }
      });
      req.on('error', reject);
    });

  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const p = u.pathname;
      const method = (req.method ?? 'GET').toUpperCase();
      const ip = req.socket.remoteAddress ?? 'unknown';
      const ownerUid = uidOf(u.searchParams.get('uid') ?? req.headers['x-player-uid']);

      if (method === 'OPTIONS') return send(res, 204, {});

      if (p === '/health') return send(res, 200, { ok: true, service: 'rumblewersfad-presence', online: hub.onlineCount() });

      // Общий токен для приватного сервера (необязателен)
      // /health и публичная страница приглашения доступны без ключа
      const isPublicPage = p === '/health' || /^\/i\/[A-Za-z0-9_-]{4,32}$/.test(p);
      if (token && !isPublicPage && req.headers['x-community-token'] !== token) {
        return send(res, 401, { ok: false, error: 'unauthorized' });
      }

      if (method !== 'GET' && !hub.allow(ip)) return send(res, 429, { ok: false, error: 'rate limited' });

      // ---- presence ----
      if (p === '/presence' && method === 'POST') return send(res, 200, hub.heartbeat(await readBody(req)));
      if ((p === '/presence' || p === '/players/online') && method === 'GET') {
        return send(res, 200, { players: hub.directory().filter((e) => e.status !== 'offline') });
      }

      // ---- directory / search ----
      if ((p === '/directory' || p === '/users/search' || p === '/players') && method === 'GET') {
        return send(res, 200, { players: hub.directory(u.searchParams.get('q') ?? '') });
      }

      // ---- invites ----
      if (p === '/invites' && method === 'POST') {
        const b = await readBody(req);
        const uid = uidOf(b.uid) || ownerUid;
        if (!uid) return send(res, 400, { ok: false, error: 'invalid uid' });
        const inv = hub.createInvite(uid);
        return send(res, 200, { ok: true, code: inv.code, expiresAt: inv.expiresAt });
      }
      const invMatch = p.match(/^\/invites\/([A-Za-z0-9_-]{4,32})(\/redeem)?$/);
      if (invMatch) {
        const code = invMatch[1];
        if (method === 'GET') return send(res, 200, hub.resolveInvite(code));
        if (method === 'POST' && invMatch[2]) {
          const b = await readBody(req);
          const uid = uidOf(b.uid) || ownerUid;
          if (!uid) return send(res, 400, { ok: false, error: 'invalid uid' });
          return send(res, 200, hub.redeemInvite(code, uid));
        }
      }

      // ---- friends (uid в query или заголовке) ----
      if (p === '/friends' && method === 'GET') return send(res, 200, hub.friends(ownerUid));
      if (p === '/friends' && method === 'POST') {
        const b = await readBody(req);
        return send(res, 200, hub.addFriend(uidOf(b.uid) || ownerUid, uidOf(b.targetUid) || clean(b.nickname, 64)));
      }
      const friendMatch = p.match(/^\/friends\/([A-Za-z0-9_-]{6,64})$/);
      if (friendMatch) {
        if (method === 'DELETE') return send(res, 200, hub.removeFriend(ownerUid, friendMatch[1]));
        if (method === 'PUT') { const b = await readBody(req); return send(res, 200, hub.setStatus(friendMatch[1], (b.status as PlayerStatus) ?? 'online')); }
      }

      // ---- requests ----
      if (p === '/friends/requests' && method === 'GET') return send(res, 200, hub.requests(ownerUid));
      if (p === '/friends/requests' && method === 'POST') {
        const b = await readBody(req);
        return send(res, 200, hub.createRequest(uidOf(b.fromUid) || ownerUid, uidOf(b.toUid) || clean(b.nickname, 64)));
      }
      const reqMatch = p.match(/^\/friends\/requests\/([A-Za-z0-9-]{8,64})\/(accept|decline)$/);
      if (reqMatch && method === 'POST') return send(res, 200, hub.resolveRequest(reqMatch[1], ownerUid, reqMatch[2] === 'accept'));

      // ---- blocked ----
      if (p === '/friends/blocked' && method === 'GET') return send(res, 200, hub.blocked(ownerUid));
      if (p === '/friends/blocked' && method === 'POST') {
        const b = await readBody(req);
        return send(res, 200, hub.block(ownerUid, uidOf(b.targetUid) || clean(b.nickname, 64)));
      }
      const blockedMatch = p.match(/^\/friends\/blocked\/(.+)$/);
      if (blockedMatch && method === 'DELETE') return send(res, 200, hub.unblock(ownerUid, decodeURIComponent(blockedMatch[1])));

      // ---- SSE: живые обновления ----
      if (p === '/events' && method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'X-Accel-Buffering': 'no'
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', at: Date.now() })}\n\n`);
        hub.addSse(res);
        const ka = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* ignore */ } }, 20_000);
        req.on('close', () => { clearInterval(ka); hub.removeSse(res); });
        return;
      }

      // ---- Публичная страница приглашения: /i/CODE ----
      const webInvite = p.match(/^\/i\/([A-Za-z0-9_-]{4,32})$/);
      if (webInvite && method === 'GET') {
        const info = hub.resolveInvite(webInvite[1]);
        const name = info.ok && info.from ? info.from.nickname : null;
        const deep = `rumblewersfad://invite/${webInvite[1]}`;
        const safeName = name ? String(name).replace(/[<>&"]/g, '') : '';
        res.writeHead(info.ok ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        return res.end(`<!doctype html><html lang="ru"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rumblewersfad — приглашение в друзья</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 50% 20%,#2a1a52,#0d0718 70%);color:#eee7ff;font:16px system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
.card{background:rgba(35,22,70,.75);border:1px solid rgba(167,139,250,.28);border-radius:24px;padding:38px;max-width:460px;width:100%;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.45)}
.av{width:76px;height:76px;border-radius:50%;margin:0 auto 18px;display:grid;place-items:center;font-size:32px;font-weight:700;background:linear-gradient(135deg,#8B5CF6,#C4B5FD);color:#1a0f33}
h1{font-size:22px;margin:0 0 8px}p{color:#b9aede;line-height:1.6;font-size:14px}
a.btn,button.btn{display:block;width:100%;margin-top:20px;padding:14px;border:0;border-radius:14px;background:linear-gradient(100deg,#8B5CF6,#A78BFA);color:#fff;font-weight:700;font-size:15px;text-decoration:none;cursor:pointer}
button.sec{margin-top:10px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);color:#ddd}
code{display:block;margin-top:16px;padding:11px;background:rgba(0,0,0,.3);border-radius:10px;font-size:13px;color:#c4b5fd;word-break:break-all}
small{display:block;margin-top:18px;color:#7c6f9c}
</style>
<div class="card">
<div class="av">${safeName ? safeName[0].toUpperCase() : '✕'}</div>
<h1>${info.ok ? 'Тебя приглашают в друзья' : 'Ссылка недействительна'}</h1>
<p>${info.ok
  ? 'Игрок <b>' + safeName + '</b> хочет добавить тебя в друзья в Rumblewersfad. Открой лаунчер — и вы сразу станете друзьями.'
  : 'Эта пригласительная ссылка устарела или уже использована. Попроси новую.'}</p>
${info.ok ? `<a class="btn" href="${deep}">Открыть в лаунчере</a>
<button class="btn sec" onclick="navigator.clipboard&&navigator.clipboard.writeText('${webInvite[1]}')">Скопировать код</button>
<code>${webInvite[1]}</code>
<small>Если кнопка не сработала — скопируй код и вставь его во вкладке «Друзья» → «Пригласительная ссылка».</small>` : ''}
</div></html>`);
      }

      // ---- корень: понятная страничка-статус ----
      if (p === '/' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        return res.end(`<!doctype html><meta charset="utf-8"><title>Rumblewersfad Presence</title>
<style>body{background:#120a24;color:#e9e2ff;font:16px system-ui;padding:40px;max-width:720px;margin:auto}
code{background:#2a1a4a;padding:2px 8px;border-radius:6px}</style>
<h1>Rumblewersfad Presence Server</h1>
<p>Сервер каталога игроков работает. Сейчас онлайн: <b>${hub.onlineCount()}</b>,
в каталоге: <b>${hub.directory().length}</b>.</p>
<p>Укажите <code>http://${host === '0.0.0.0' ? 'THIS_HOST' : host}:${port}</code>
в Настройках → Сообщество, чтобы лаунчеры видели друг друга.</p>
<p><a href="/health" style="color:#b794ff">/health</a> ·
<a href="/directory" style="color:#b794ff">/directory</a> ·
<a href="/events" style="color:#b794ff">/events</a></p>`);
      }

      return send(res, 404, { ok: false, error: 'unknown route' });
    } catch (err: any) {
      return send(res, 400, { ok: false, error: err?.message ?? 'bad request' });
    }
  });

  // ---- WebSocket /presence (совместимость с контрактом из README) ----
  server.on('upgrade', (req: IncomingMessage, socket: Socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || !(req.url ?? '').startsWith('/presence')) { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    hub.addWs(socket);
    socket.on('close', () => hub.removeWs(socket));
    socket.on('error', () => hub.removeWs(socket));
    socket.write(wsTextFrame(JSON.stringify({ type: 'connected', at: Date.now() })));
  });

  // Держим список сокетов, чтобы close() не ждал keep-alive/SSE-соединений
  const sockets = new Set<Socket>();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  return {
    port,
    host,
    hub,
    close: () => new Promise<void>((resolve) => {
      hub.dispose();
      for (const s of sockets) s.destroy();
      sockets.clear();
      server.close(() => resolve());
    })
  };
}
