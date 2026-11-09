import type { Api, GameStatusPayload } from '../../preload/preload.d';

// In dev under plain browser (vite only) window.api is absent — даём заглушку,
// чтобы вёрстка не падала без Electron.
const stub: Partial<Api> = {
  getPlayerId: async () => ({ id: 'RV-0000-0000' }),
  getSettings: async () => ({
    gameFolder: null, gameExecutable: null, launchArgs: [], region: 'auto',
    language: 'ru', theme: 'violet', autoStart: false, closeToTray: false, repairSourceUrl: '',
    dataSource: 'local', apiBaseUrl: 'http://localhost:8080', wsUrl: '',
    newsUrl: '', profileName: 'Player', onboarded: false,
    communityUrl: '', communityHost: true, communityLan: false, communityPort: 8787,
    communityToken: '', presenceVisible: true
  }),
  communityStatus: async () => ({ online: 0, reachable: false, url: '', uid: 'browser-dev', playerId: '000', hosting: false, inviteScheme: 'rumblewersfad' }),
  communityDirectory: async () => [],
  communityHeartbeat: async () => ({ online: 0, reachable: false, url: '', uid: 'browser-dev', playerId: '000', hosting: false, inviteScheme: 'rumblewersfad' }),
  communityInviteCreate: async () => ({ code: '', deepLink: '', webLink: '', expiresAt: 0 }),
  communityInviteResolve: async () => ({ ok: false, error: 'Electron only' }),
  communityInviteRedeem: async () => ({ ok: false, error: 'Electron only' }),
  communityFriends: async () => [],
  communityFriendAdd: async () => [],
  communityFriendRemove: async () => [],
  communityRequests: async () => [],
  communityRequestSend: async () => ({}),
  communityRequestResolve: async () => ({}),
  communityPendingInvite: async () => null,
  communityClearInvite: async () => ({ ok: true }),
  communitySetVisible: async () => ({}),
  communityRestartHost: async () => ({ ok: false, hosting: false, url: '' }),
  gameNetworkState: async () => ({ identity: { ok: false }, wsConnected: false, totalPlayers: null, bridgeConnected: false, lastUpdate: 0 }),
  gameNetworkRefresh: async () => ({ identity: { ok: false }, wsConnected: false, totalPlayers: null, bridgeConnected: false, lastUpdate: 0 }),
  gameNetworkConfig: async () => ({ identity: { ok: false }, wsConnected: false, totalPlayers: null, bridgeConnected: false, lastUpdate: 0 }),
  onGameNetworkUpdate: () => {},
  appBuildInfo: async () => ({
    installed: { version: 'dev', builtAt: null, sourceHash: null },
    latest: null,
    installerPath: ''
  }),
  appOpenInstaller: async () => ({ ok: false }),
  onCommunityUpdate: () => {},
  onCommunityInvite: () => {},
  getGameStatus: async () => ({ running: false, pid: null, spawnedAt: null, exitCode: null, exited: false, stdout: '', stderr: '' }),
  searchGamePlayers: async () => [],
  getFolderInfo: async () => ({ folder: null, size: 0, sizeText: '—', valid: false }),
  getMatches: async () => [],
  getFriends: async () => [],
  getRequests: async () => [],
  getBlocked: async () => [],
  getNews: async () => [],
  getLogs: async () => ''
};

export const api: Api = (typeof window !== 'undefined' && window.api ? window.api : stub) as Api;

export type { GameStatusPayload };
