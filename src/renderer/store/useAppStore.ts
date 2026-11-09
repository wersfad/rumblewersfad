import { create } from 'zustand';
import { api } from '../api/api';
import type { GameStatusPayload } from '../api/api';

export type View = 'home' | 'news' | 'stats' | 'matches' | 'friends' | 'settings' | 'credits';
export type GameUiStatus = 'waiting' | 'ready' | 'launching' | 'running' | 'closed';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

export interface Settings {
  gameFolder: string | null;
  gameExecutable: string | null;
  launchArgs: string[];
  region: string;
  language: 'ru' | 'en';
  theme: 'violet' | 'dark';
  autoStart: boolean;
  closeToTray: boolean;
  repairSourceUrl: string;
  dataSource: 'local' | 'remote';
  apiBaseUrl: string;
  wsUrl: string;
  newsUrl: string;
  profileName: string;
  onboarded: boolean;
  communityUrl: string;
  communityHost: boolean;
  communityLan: boolean;
  communityPort: number;
  communityToken: string;
  presenceVisible: boolean;
  gameNetworkEnabled: boolean;
  gameLauncherToken: string;
  gameBridgePort: number;
}

interface AppState {
  view: View;
  settings: Settings | null;
  playerId: string | null;
  minimizing: boolean;
  setMinimizing: (v: boolean) => void;
  gameStatus: GameUiStatus;
  gameExitCode: number | null;
  folderInfo: any;
  matches: any[];
  friends: any[];
  requests: any[];
  blocked: string[];
  toasts: Toast[];
  search: string;
  /** Запрос из глобального поиска, пробрасывается в каталог игроков. */
  directoryQuery: string;
  region: string;
  setView: (v: View) => void;
  setSearch: (s: string) => void;
  setDirectoryQuery: (s: string) => void;
  openPlayerSearch: (q?: string) => void;
  setRegion: (r: string) => void;
  toast: (type: Toast['type'], text: string) => void;
  dismissToast: (id: number) => void;
  loadInitial: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshFolderInfo: () => Promise<void>;
  refreshMatches: () => Promise<void>;
  refreshFriends: () => Promise<void>;
  setGameStatus: (s: GameUiStatus, code?: number | null) => void;
  patchSettings: (p: Partial<Settings>) => Promise<void>;
}

let toastId = 0;

export const useAppStore = create<AppState>((set, get) => ({
  view: 'home',
  settings: null,
  playerId: null,
  minimizing: false,
  setMinimizing: (minimizing) => set({ minimizing }),
  gameStatus: 'waiting',
  gameExitCode: null,
  folderInfo: null,
  matches: [],
  friends: [],
  requests: [],
  blocked: [],
  toasts: [],
  search: '',
  directoryQuery: '',
  region: 'auto',

  setView: (view) => set({ view }),
  setSearch: (search) => set({ search }),
  setRegion: (region) => set({ region }),
  setDirectoryQuery: (directoryQuery) => set({ directoryQuery }),
  openPlayerSearch: (q) => {
    set({ view: 'friends', directoryQuery: q ?? get().search ?? '' });
  },

  toast: (type, text) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { id, type, text }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  loadInitial: async () => {
    const [settings, folderInfo, matches, friends, requests, blocked, status, player] = await Promise.all([
      api.getSettings(),
      api.getFolderInfo(),
      api.getMatches(),
      api.getFriends(),
      api.getRequests(),
      api.getBlocked(),
      api.getGameStatus(),
      api.getPlayerId()
    ]);
    const gameStatus: GameUiStatus = status.running ? 'running' : settings.gameFolder ? 'ready' : 'waiting';
    set({
      settings,
      playerId: player?.id ?? null,
      folderInfo,
      matches: matches ?? [],
      friends: friends ?? [],
      requests: requests ?? [],
      blocked: blocked ?? [],
      region: settings.region ?? 'auto',
      gameStatus,
      gameExitCode: status.exitCode ?? null
    });
    // IPC-события
    api.onGameStatus?.((_e: unknown, s: GameStatusPayload) => {
      set({
        gameStatus: s.running ? 'running' : s.exited ? 'closed' : 'launching',
        gameExitCode: s.exitCode ?? null
      });
    });
    api.onToast?.((_e: unknown, msg: { type: string; text: string }) => {
      get().toast(msg.type as Toast['type'], msg.text);
    });
  },

  refreshSettings: async () => set({ settings: await api.getSettings() }),
  refreshFolderInfo: async () => {
    const folderInfo = await api.getFolderInfo();
    const s = get().settings;
    set({
      folderInfo,
      gameStatus: get().gameStatus === 'running' ? 'running' : folderInfo?.valid ? 'ready' : 'waiting'
    });
    void s;
  },
  refreshMatches: async () => set({ matches: (await api.getMatches()) ?? [] }),
  refreshFriends: async () => {
    const [friends, requests, blocked, remote] = await Promise.all([
      api.getFriends(), api.getRequests(), api.getBlocked(),
      api.communityFriends?.().catch(() => []) ?? Promise.resolve([])
    ]);
    // Друзья с сервера сообщества подмешиваются в локальный список:
    // после принятия приглашения карточка сразу видна во вкладке «Все».
    const local = (friends ?? []) as any[];
    const merged = [...local];
    for (const r of (remote ?? []) as any[]) {
      if (!r?.uid) continue;
      const i = merged.findIndex((f) => f.id === r.uid || f.nickname === r.nickname);
      const card = {
        id: r.uid,
        nickname: r.nickname,
        status: r.status ?? 'offline',
        avatarColor: r.avatarColor ?? '#8B5CF6'
      };
      if (i >= 0) merged[i] = { ...merged[i], ...card };
      else merged.push(card);
    }
    set({ friends: merged, requests: requests ?? [], blocked: blocked ?? [] });
  },

  setGameStatus: (gameStatus, code = null) => set({ gameStatus, gameExitCode: code }),

  patchSettings: async (p) => {
    const next = await api.setSettings(p);
    set({ settings: next });
    if (p.region) set({ region: p.region });
  }
}));
