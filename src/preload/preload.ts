import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // window
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  onMaximized: (cb: () => void) => ipcRenderer.on('window:maximize', cb),
  onUnmaximized: (cb: () => void) => ipcRenderer.on('window:unmaximize', cb),
  onRestored: (cb: () => void) => ipcRenderer.on('window:restore', cb),

  // game
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  validateFolder: (folder: string) => ipcRenderer.invoke('game:validate', folder),
  launchGame: (args?: string[]) => ipcRenderer.invoke('game:launch', args),
  safeLaunchGame: (args?: string[]) => ipcRenderer.invoke('game:safeLaunch', args),
  stopGame: () => ipcRenderer.invoke('game:stop'),
  getGameStatus: () => ipcRenderer.invoke('game:status'),
  searchGamePlayers: (q: string) => ipcRenderer.invoke('game:searchPlayers', q),
  repairFiles: () => ipcRenderer.invoke('game:repair'),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  copyLogs: () => ipcRenderer.invoke('logs:copy'),
  openLogsFile: () => ipcRenderer.invoke('logs:open'),

  // player
  getPlayerId: () => ipcRenderer.invoke('player:getId'),

  // settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: any) => ipcRenderer.invoke('settings:set', patch),
  getFolderInfo: () => ipcRenderer.invoke('folder:info'),
  openFolder: () => ipcRenderer.invoke('folder:open'),

  // data
  getMatches: () => ipcRenderer.invoke('data:matches'),
  setMatches: (matches: any[]) => ipcRenderer.invoke('data:matches:set', matches),
  getFriends: () => ipcRenderer.invoke('data:friends'),
  setFriends: (friends: any[]) => ipcRenderer.invoke('data:friends:set', friends),
  getRequests: () => ipcRenderer.invoke('data:requests'),
  setRequests: (reqs: any[]) => ipcRenderer.invoke('data:requests:set', reqs),
  getBlocked: () => ipcRenderer.invoke('data:blocked'),
  addBlocked: (name: string) => ipcRenderer.invoke('data:blocked:add', name),
  removeBlocked: (name: string) => ipcRenderer.invoke('data:blocked:remove', name),

  // news
  getNews: () => ipcRenderer.invoke('news:get'),

  // community: real players / search / invites
  communityStatus: () => ipcRenderer.invoke('community:status'),
  communityDirectory: (q?: string) => ipcRenderer.invoke('community:directory', q),
  communityHeartbeat: (status?: string) => ipcRenderer.invoke('community:heartbeat', status),
  communityInviteCreate: () => ipcRenderer.invoke('community:invite:create'),
  communityInviteResolve: (v: string) => ipcRenderer.invoke('community:invite:resolve', v),
  communityInviteRedeem: (v: string) => ipcRenderer.invoke('community:invite:redeem', v),
  communityFriends: () => ipcRenderer.invoke('community:friends'),
  communityFriendAdd: (uid: string) => ipcRenderer.invoke('community:friend:add', uid),
  communityFriendRemove: (uid: string) => ipcRenderer.invoke('community:friend:remove', uid),
  communityRequests: () => ipcRenderer.invoke('community:requests'),
  communityRequestSend: (uid: string) => ipcRenderer.invoke('community:request:send', uid),
  communityRequestResolve: (id: string, accept: boolean) => ipcRenderer.invoke('community:request:resolve', id, accept),
  communityPendingInvite: () => ipcRenderer.invoke('community:invite:pending'),
  communityClearInvite: () => ipcRenderer.invoke('community:invite:clear'),
  communitySetVisible: (v: boolean) => ipcRenderer.invoke('community:setVisible', v),
  communityRestartHost: () => ipcRenderer.invoke('community:restartHost'),
  gameNetworkState: () => ipcRenderer.invoke('community:gameState'),
  gameNetworkRefresh: () => ipcRenderer.invoke('community:gameRefresh'),
  gameNetworkConfig: (p: any) => ipcRenderer.invoke('community:gameConfig', p),
  onGameNetworkUpdate: (cb: (e: any, s: any) => void) => ipcRenderer.on('community:gameUpdate', cb),
  onCommunityUpdate: (cb: (e: any, s: any) => void) => ipcRenderer.on('community:update', cb),
  onCommunityInvite: (cb: (e: any, code: string) => void) => ipcRenderer.on('community:invite', cb),

  // build / updates
  appBuildInfo: () => ipcRenderer.invoke('app:buildInfo'),
  appOpenInstaller: () => ipcRenderer.invoke('app:openInstaller'),

  // events
  onGameStatus: (cb: (e: any, s: any) => void) =>
    ipcRenderer.on('game:status', cb),
  onGameExit: (cb: (e: any, code: number) => void) =>
    ipcRenderer.on('game:exit', cb),
  onGameLog: (cb: (e: any, line: string) => void) =>
    ipcRenderer.on('game:log', cb),
  onToast: (cb: (e: any, msg: any) => void) =>
    ipcRenderer.on('toast', cb)
};

contextBridge.exposeInMainWorld('api', api);