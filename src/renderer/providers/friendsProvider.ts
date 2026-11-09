import { api } from '../api/api';
import { community } from './communityProvider';

export type FriendStatus = 'online' | 'inGame' | 'offline';

export interface Friend {
  id: string;
  nickname: string;
  status: FriendStatus;
  avatarColor?: string;
}

export interface FriendRequest {
  id: string;
  nickname: string;
  direction: 'in' | 'out';
}

export interface SearchedUser {
  id: string;          // uid из каталога сообщества
  nickname: string;
  status?: FriendStatus;
  playerId?: string;   // короткий публичный номер (#123)
  lastSeen?: number;
}

export interface FriendsProvider {
  list(): Promise<Friend[]>;
  requests(): Promise<FriendRequest[]>;
  blocked(): Promise<string[]>;
  /** Поиск игроков по нику: возвращает совпадения с их ID. */
  searchUsers(query: string): Promise<SearchedUser[]>;
  /** Добавить выбранного из результатов поиска. */
  addUser(user: SearchedUser): Promise<Friend[]>;
  addByNickname(nickname: string): Promise<Friend[]>;
  remove(id: string): Promise<Friend[]>;
  sendRequest(nickname: string): Promise<FriendRequest[]>;
  accept(id: string): Promise<void>;
  decline(id: string): Promise<void>;
  block(nickname: string): Promise<void>;
  unblock(nickname: string): Promise<void>;
  setStatus(id: string, status: FriendStatus): Promise<Friend[]>;
  subscribePresence?(cb: (f: Friend) => void): () => void;
}

const colors = ['#8B5CF6', '#A78BFA', '#6D28D9', '#C4B5FD', '#7C3AED', '#9F7AEA'];
const colorFor = (name: string) => colors[name.charCodeAt(0) % colors.length];

/**
 * Поиск теперь идёт по каталогу РЕАЛЬНЫХ игроков (сервер присутствия).
 * Демо-заглушки убраны: если сервер недоступен, список просто пустой,
 * и UI показывает подсказку, как подключиться.
 */
async function realUsers(query: string): Promise<SearchedUser[]> {
  const players = await community.directory(query);
  return players.map((p) => ({
    id: p.uid,
    nickname: p.nickname,
    status: p.status,
    playerId: p.playerId,
    lastSeen: p.lastSeen
  }));
}

/** Локальный провайдер: друзья и заявки в electron-store, статусы вручную. */
export class LocalFriendsProvider implements FriendsProvider {
  async list(): Promise<Friend[]> { return (await api.getFriends()) as Friend[]; }
  async requests(): Promise<FriendRequest[]> { return (await api.getRequests()) as FriendRequest[]; }
  async blocked(): Promise<string[]> { return (await api.getBlocked()) as string[]; }

  async searchUsers(query: string): Promise<SearchedUser[]> {
    const q = query.trim();
    if (!q) return [];
    const real = await realUsers(q);
    if (real.length) return real;
    // Сервер недоступен — ищем хотя бы среди уже добавленных друзей
    const friends = await this.list();
    return friends
      .filter((f) => f.nickname.toLowerCase().includes(q.toLowerCase()))
      .map((f) => ({ id: f.id, nickname: f.nickname, status: f.status }));
  }

  async addUser(user: SearchedUser): Promise<Friend[]> {
    // Отправляем заявку на сервер, а локально сохраняем карточку друга
    try { await community.sendRequest(user.id); } catch { /* офлайн — всё равно сохраним локально */ }
    const all = await this.list();
    if (all.some((f) => f.id === user.id)) return all;
    const friend: Friend = {
      id: user.id ?? crypto.randomUUID(),
      nickname: user.nickname,
      status: user.status ?? 'offline',
      avatarColor: colorFor(user.nickname)
    };
    return (await api.setFriends([...all, friend])) as Friend[];
  }

  async addByNickname(nickname: string): Promise<Friend[]> {
    const all = await this.list();
    if (all.some((f) => f.nickname.toLowerCase() === nickname.toLowerCase())) return all;
    const friend: Friend = { id: crypto.randomUUID(), nickname, status: 'offline', avatarColor: colorFor(nickname) };
    return (await api.setFriends([...all, friend])) as Friend[];
  }
  async remove(id: string): Promise<Friend[]> {
    return (await api.setFriends((await this.list()).filter((f) => f.id !== id))) as Friend[];
  }
  async sendRequest(nickname: string): Promise<FriendRequest[]> {
    const reqs = await this.requests();
    if (reqs.some((r) => r.nickname.toLowerCase() === nickname.toLowerCase())) return reqs;
    const req: FriendRequest = { id: crypto.randomUUID(), nickname, direction: 'out' };
    return (await api.setRequests([...reqs, req])) as FriendRequest[];
  }
  async accept(id: string): Promise<void> {
    const reqs = await this.requests();
    const req = reqs.find((r) => r.id === id);
    if (!req) return;
    await api.setRequests(reqs.filter((r) => r.id !== id));
    await this.addByNickname(req.nickname);
  }
  async decline(id: string): Promise<void> {
    await api.setRequests((await this.requests()).filter((r) => r.id !== id));
  }
  async block(nickname: string): Promise<void> {
    await api.addBlocked(nickname);
    await api.setFriends((await this.list()).filter((f) => f.nickname !== nickname));
  }
  async unblock(nickname: string): Promise<void> {
    await api.removeBlocked(nickname);
  }
  async setStatus(id: string, status: FriendStatus): Promise<Friend[]> {
    const all = await this.list();
    const next = all.map((f) => (f.id === id ? { ...f, status } : f));
    return (await api.setFriends(next)) as Friend[];
  }
}

/** Удалённый провайдер: REST + WebSocket для онлайн-статусов. */
export class RemoteFriendsProvider implements FriendsProvider {
  constructor(private baseUrl: string, private wsUrl: string) {}
  private url(p: string) { return this.baseUrl.replace(/\/$/, '') + p; }
  private async req<T>(p: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.url(p), init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  list(): Promise<Friend[]> { return this.req('/friends'); }
  requests(): Promise<FriendRequest[]> { return this.req('/friends/requests'); }
  blocked(): Promise<string[]> { return this.req('/friends/blocked'); }
  async searchUsers(query: string): Promise<SearchedUser[]> {
    // Сначала реальный каталог сообщества (общий для всех лаунчеров),
    // затем — совместимость со старым /users/search на кастомном API.
    const real = await realUsers(query);
    if (real.length) return real;
    try {
      const r = await this.req<Array<{ id: string; nickname: string; status?: FriendStatus }>>(
        '/users/search?q=' + encodeURIComponent(query)
      );
      return Array.isArray(r) ? r : [];
    } catch { return []; }
  }
  async addUser(user: SearchedUser): Promise<Friend[]> {
    return this.req('/friends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) });
  }
  async addByNickname(nickname: string): Promise<Friend[]> {
    return this.req('/friends', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname }) });
  }
  async remove(id: string): Promise<Friend[]> { return this.req(`/friends/${id}`, { method: 'DELETE' }); }
  async sendRequest(nickname: string): Promise<FriendRequest[]> {
    return this.req('/friends/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname }) });
  }
  async accept(id: string): Promise<void> { await this.req(`/friends/requests/${id}/accept`, { method: 'POST' }); }
  async decline(id: string): Promise<void> { await this.req(`/friends/requests/${id}/decline`, { method: 'POST' }); }
  async block(nickname: string): Promise<void> { await this.req('/friends/blocked', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname }) }); }
  async unblock(nickname: string): Promise<void> { await this.req(`/friends/blocked/${encodeURIComponent(nickname)}`, { method: 'DELETE' }); }
  async setStatus(id: string, status: FriendStatus): Promise<Friend[]> {
    return this.req(`/friends/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  }
  subscribePresence(cb: (f: Friend) => void): () => void {
    if (!this.wsUrl) return () => {};
    const ws = new WebSocket(this.wsUrl.replace(/^http/, 'ws') + '/presence');
    ws.onmessage = (e) => {
      try { cb(JSON.parse(e.data) as Friend); } catch { /* ignore */ }
    };
    return () => ws.close();
  }
}

export function createFriendsProvider(dataSource: 'local' | 'remote', apiBaseUrl: string, wsUrl: string): FriendsProvider {
  return dataSource === 'remote' ? new RemoteFriendsProvider(apiBaseUrl, wsUrl) : new LocalFriendsProvider();
}
