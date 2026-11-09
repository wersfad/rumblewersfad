import { api } from '../api/api';
import type { CommunityPlayer, CommunityRequest, CommunityInvite, CommunityStatus, GameNetworkState } from '../../preload/preload.d';

export type { CommunityPlayer, CommunityRequest, CommunityInvite, CommunityStatus, GameNetworkState };

/**
 * Единая точка доступа к каталогу РЕАЛЬНЫХ игроков.
 * Данные приходят из main-процесса (IPC), который общается с сервером
 * присутствия — рендерер сам в сеть не ходит.
 */
export const community = {
  status(): Promise<CommunityStatus> { return api.communityStatus(); },

  /** Все игроки каталога. q — поиск по нику / ID / uid. */
  async directory(q = ''): Promise<CommunityPlayer[]> {
    try { return await api.communityDirectory(q); } catch { return []; }
  },

  /** Поиск для выпадающего списка. */
  search(q: string): Promise<CommunityPlayer[]> {
    const query = q.trim();
    if (query.length < 1) return Promise.resolve([]);
    return this.directory(query);
  },

  heartbeat(): Promise<CommunityStatus> { return api.communityHeartbeat(); },

  createInvite(): Promise<CommunityInvite> { return api.communityInviteCreate(); },
  resolveInvite(codeOrLink: string) { return api.communityInviteResolve(codeOrLink); },
  redeemInvite(codeOrLink: string) { return api.communityInviteRedeem(codeOrLink); },

  async friends(): Promise<CommunityPlayer[]> {
    try { return await api.communityFriends(); } catch { return []; }
  },
  addFriend(uid: string) { return api.communityFriendAdd(uid); },
  removeFriend(uid: string) { return api.communityFriendRemove(uid); },

  async requests(): Promise<CommunityRequest[]> {
    try { return await api.communityRequests(); } catch { return []; }
  },
  sendRequest(uid: string) { return api.communityRequestSend(uid); },
  resolveRequest(id: string, accept: boolean) { return api.communityRequestResolve(id, accept); },

  pendingInvite(): Promise<string | null> { return api.communityPendingInvite(); },
  clearInvite() { return api.communityClearInvite(); },
  setVisible(v: boolean) { return api.communitySetVisible(v); },
  restartHost() { return api.communityRestartHost(); },

  gameNetworkState(): Promise<GameNetworkState> { return api.gameNetworkState(); },
  gameNetworkRefresh(): Promise<GameNetworkState> { return api.gameNetworkRefresh(); },
  gameNetworkConfig(patch: { gameNetworkEnabled?: boolean; gameLauncherToken?: string; gameBridgePort?: number }) {
    return api.gameNetworkConfig(patch);
  },
  onGameNetworkUpdate(cb: (s: GameNetworkState) => void) {
    api.onGameNetworkUpdate?.((_e: unknown, s: GameNetworkState) => cb(s));
  },

  onUpdate(cb: (s: CommunityStatus) => void) {
    api.onCommunityUpdate?.((_e: unknown, s: CommunityStatus) => cb(s));
  },
  onInvite(cb: (code: string) => void) {
    api.onCommunityInvite?.((_e: unknown, code: string) => cb(code));
  }
};

/** Копирование с запасным вариантом для старых сборок Electron. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement('textarea');
      el.value = text; el.style.position = 'fixed'; el.style.opacity = '0';
      document.body.appendChild(el); el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok;
    } catch { return false; }
  }
}

/** Человекочитаемое время последней активности. */
export function lastSeenLabel(ts: number, lang: 'ru' | 'en'): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 45) return lang === 'ru' ? 'сейчас' : 'just now';
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    return lang === 'ru' ? `${m} мин назад` : `${m}m ago`;
  }
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    return lang === 'ru' ? `${h} ч назад` : `${h}h ago`;
  }
  const d = Math.floor(sec / 86400);
  return lang === 'ru' ? `${d} дн назад` : `${d}d ago`;
}
