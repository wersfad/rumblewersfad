import Store from 'electron-store';
import crypto from 'node:crypto';

export type Language = 'ru' | 'en';
export type Region = 'auto' | 'eu' | 'na' | 'asia';
export type DataSource = 'local' | 'remote';
export type Theme = 'violet' | 'dark';

export interface Settings {
  gameFolder: string | null;
  gameExecutable: string | null;
  launchArgs: string[];
  region: Region;
  language: Language;
  theme: Theme;
  autoStart: boolean;
  closeToTray: boolean;
  repairSourceUrl: string;
  dataSource: DataSource;
  apiBaseUrl: string;
  wsUrl: string;
  newsUrl: string;
  profileName: string;
  onboarded: boolean;

  // --- Сообщество: каталог реальных игроков ---
  /** URL сервера присутствия. Пусто = встроенный локальный сервер. */
  communityUrl: string;
  /** Поднимать встроенный сервер в процессе лаунчера. */
  communityHost: boolean;
  /** Слушать всю локальную сеть (друзья в том же Wi-Fi смогут подключиться). */
  communityLan: boolean;
  /** Порт встроенного сервера. */
  communityPort: number;
  /** Общий ключ для приватного сервера (необязательно). */
  communityToken: string;
  /** Показывать себя в каталоге игроков (opt-in). */
  presenceVisible: boolean;

  // --- Сеть игры (реальные игроки из файлов Rumbleverse) ---
  /** Включить источник игроков из бэкенда/логов игры. */
  gameNetworkEnabled: boolean;
  /** Токен лаунчера rVclient (необязательно, для живых серверов). */
  gameLauncherToken: string;
  /** Порт локального моста rVclient (-RVBridgePort). */
  gameBridgePort: number;
}

export interface StoreSchema {
  settings: Settings;
  matches: unknown[];
  friends: unknown[];
  friendRequests: unknown[];
  blocked: string[];
  playerId: string;
  /** Стабильный уникальный ID этой установки (не путать с коротким playerId). */
  clientUid: string;
}

export const defaultSettings: Settings = {
  gameFolder: null,
  gameExecutable: null,
  launchArgs: [],
  region: 'auto',
  language: 'ru',
  theme: 'violet',
  autoStart: false,
  closeToTray: false,
  repairSourceUrl: '',
  dataSource: 'local',
  apiBaseUrl: 'http://localhost:8080',
  wsUrl: '',
  newsUrl: '',
  profileName: 'Player',
  onboarded: false,
  communityUrl: '',
  communityHost: true,
  communityLan: false,
  communityPort: 8787,
  communityToken: '',
  presenceVisible: true,
  gameNetworkEnabled: true,
  gameLauncherToken: '',
  gameBridgePort: 47818
};

export const store = new Store<StoreSchema>({
  name: 'rumblewersfad',
  defaults: {
    settings: defaultSettings,
    matches: [],
    friends: [],
    friendRequests: [],
    blocked: [],
    playerId: '',
    clientUid: ''
  }
});

/** Постоянный ID игрока: 3 случайные цифры, генерируется при первом запуске
 *  и хранится навсегда. Старый формат (RV-XXXX-XXXX) мигрирует один раз. */
export function getOrCreatePlayerId(): string {
  let id = store.get('playerId') as string | undefined;
  if (!id || !/^\d{3}$/.test(id)) {
    id = String(100 + Math.floor(Math.random() * 900)); // 100..999
    store.set('playerId', id);
  }
  return id;
}

/** Глобально уникальный ID установки. Короткий playerId (3 цифры) показываем
 *  людям, но для каталога нужен настоящий уникальный ключ — иначе два игрока
 *  с одинаковыми цифрами «сольются» в одного. */
export function getOrCreateClientUid(): string {
  let uid = store.get('clientUid') as string | undefined;
  if (!uid || !/^[A-Za-z0-9_-]{6,64}$/.test(uid)) {
    uid = crypto.randomUUID();
    store.set('clientUid', uid);
  }
  return uid;
}

export function getSettings(): Settings {
  return { ...defaultSettings, ...(store.get('settings') as Partial<Settings>) };
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  store.set('settings', next);
  return next;
}
