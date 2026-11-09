export interface GameStatusPayload {
  running: boolean;
  pid: number | null;
  spawnedAt: number | null;
  exitCode: number | null;
  exited: boolean;
  stdout: string;
  stderr: string;
}

/** Игрок в каталоге сообщества (реальный запущенный лаунчер). */
export interface CommunityPlayer {
  uid: string;
  playerId: string;
  nickname: string;
  status: 'online' | 'inGame' | 'offline';
  region?: string;
  lastSeen: number;
  gamePid?: number | null;
  avatarColor?: string;
  source?: 'presence' | 'game' | 'server' | 'log' | 'local';
  detail?: string;
}

export interface CommunityRequest {
  id: string;
  fromUid: string;
  fromNickname: string;
  fromPlayerId: string;
  toUid: string;
  createdAt: number;
  status: string;
}

export interface CommunityInvite {
  code: string;
  deepLink: string;
  webLink: string;
  expiresAt: number;
}

export interface GameNetworkState {
  identity: { ok: boolean; cozmoId?: string; username?: string; guestId?: string; error?: string };
  wsConnected: boolean;
  totalPlayers: number | null;
  bridgeConnected: boolean;
  lastError?: string;
  lastUpdate: number;
}

export interface CommunityStatus {
  online: number;
  reachable: boolean;
  url: string;
  uid: string;
  playerId: string;
  hosting: boolean;
  inviteScheme: string;
  lanIp?: string;
  lanPort?: number;
}

export interface Api {
  minimize(): void;
  maximize(): void;
  close(): void;
  onMaximized(cb: () => void): void;
  onUnmaximized(cb: () => void): void;
  onRestored(cb: () => void): void;
  selectFolder(): Promise<{ canceled: boolean; folder?: string; validation?: unknown; error?: string }>;
  validateFolder(folder: string): Promise<unknown>;
  launchGame(args?: string[]): Promise<{ success: boolean; error?: string; pid?: number }>;
  safeLaunchGame(args?: string[]): Promise<{ success: boolean; error?: string; pid?: number }>;
  stopGame(): Promise<{ stopped: boolean }>;
  getGameStatus(): Promise<GameStatusPayload>;
  searchGamePlayers(q: string): Promise<Array<{ id: string; nickname: string }>>;
  repairFiles(): Promise<{ checked: number; missing: string[]; ok: boolean }>;
  getLogs(): Promise<string>;
  copyLogs(): Promise<{ ok: boolean }>;
  openLogsFile(): Promise<{ ok: boolean; path: string }>;
  getPlayerId(): Promise<{ id: string }>;
  getSettings(): Promise<any>;
  setSettings(patch: any): Promise<any>;
  getFolderInfo(): Promise<any>;
  openFolder(): Promise<{ ok?: boolean; error?: string }>;
  getMatches(): Promise<any[]>;
  setMatches(m: any[]): Promise<any[]>;
  getFriends(): Promise<any[]>;
  setFriends(f: any[]): Promise<any[]>;
  getRequests(): Promise<any[]>;
  setRequests(r: any[]): Promise<any[]>;
  getBlocked(): Promise<string[]>;
  addBlocked(name: string): Promise<string[]>;
  removeBlocked(name: string): Promise<string[]>;
  getNews(): Promise<any[]>;

  // --- Сообщество: реальные игроки, поиск, приглашения ---
  communityStatus(): Promise<CommunityStatus>;
  communityDirectory(q?: string): Promise<CommunityPlayer[]>;
  communityHeartbeat(status?: 'online' | 'inGame' | 'offline'): Promise<CommunityStatus>;
  communityInviteCreate(): Promise<CommunityInvite>;
  communityInviteResolve(codeOrLink: string): Promise<{ ok: boolean; error?: string; from?: CommunityPlayer; expiresAt?: number }>;
  communityInviteRedeem(codeOrLink: string): Promise<{ ok: boolean; error?: string; friend?: CommunityPlayer }>;
  communityFriends(): Promise<CommunityPlayer[]>;
  communityFriendAdd(uid: string): Promise<CommunityPlayer[]>;
  communityFriendRemove(uid: string): Promise<CommunityPlayer[]>;
  communityRequests(): Promise<CommunityRequest[]>;
  communityRequestSend(uid: string): Promise<unknown>;
  communityRequestResolve(id: string, accept: boolean): Promise<unknown>;
  communityPendingInvite(): Promise<string | null>;
  communityClearInvite(): Promise<{ ok: boolean }>;
  communitySetVisible(visible: boolean): Promise<any>;
  communityRestartHost(): Promise<{ ok: boolean; hosting: boolean; url: string }>;
  gameNetworkState(): Promise<GameNetworkState>;
  gameNetworkRefresh(): Promise<GameNetworkState>;
  gameNetworkConfig(patch: { gameNetworkEnabled?: boolean; gameLauncherToken?: string; gameBridgePort?: number }): Promise<GameNetworkState>;
  onGameNetworkUpdate(cb: (e: unknown, s: GameNetworkState) => void): void;
  onCommunityUpdate(cb: (e: unknown, s: CommunityStatus) => void): void;
  onCommunityInvite(cb: (e: unknown, code: string) => void): void;
  appBuildInfo(): Promise<{
    installed: { version: string; builtAt: string | null; sourceHash: string | null; notes?: string };
    latest: { version: string; builtAt: string; sourceHash: string; size: number; sha256: string; notes?: string } | null;
    installerPath: string;
  }>;
  appOpenInstaller(): Promise<{ ok: boolean; path?: string; error?: string }>;

  onGameStatus(cb: (e: unknown, s: GameStatusPayload) => void): void;
  onGameExit(cb: (e: unknown, code: number) => void): void;
  onGameLog(cb: (e: unknown, line: string) => void): void;
  onToast(cb: (e: unknown, msg: { type: string; text: string }) => void): void;
}

declare global {
  interface Window {
    api: Api;
  }
}
