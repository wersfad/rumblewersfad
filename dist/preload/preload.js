import { contextBridge, ipcRenderer } from 'electron';
const api = {
    // window
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    onMaximized: (cb) => ipcRenderer.on('window:maximize', cb),
    onUnmaximized: (cb) => ipcRenderer.on('window:unmaximize', cb),
    onRestored: (cb) => ipcRenderer.on('window:restore', cb),
    // game
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
    validateFolder: (folder) => ipcRenderer.invoke('game:validate', folder),
    launchGame: (args) => ipcRenderer.invoke('game:launch', args),
    safeLaunchGame: (args) => ipcRenderer.invoke('game:safeLaunch', args),
    stopGame: () => ipcRenderer.invoke('game:stop'),
    getGameStatus: () => ipcRenderer.invoke('game:status'),
    searchGamePlayers: (q) => ipcRenderer.invoke('game:searchPlayers', q),
    repairFiles: () => ipcRenderer.invoke('game:repair'),
    getLogs: () => ipcRenderer.invoke('logs:get'),
    copyLogs: () => ipcRenderer.invoke('logs:copy'),
    openLogsFile: () => ipcRenderer.invoke('logs:open'),
    // player
    getPlayerId: () => ipcRenderer.invoke('player:getId'),
    // settings
    getSettings: () => ipcRenderer.invoke('settings:get'),
    setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
    getFolderInfo: () => ipcRenderer.invoke('folder:info'),
    openFolder: () => ipcRenderer.invoke('folder:open'),
    // data
    getMatches: () => ipcRenderer.invoke('data:matches'),
    setMatches: (matches) => ipcRenderer.invoke('data:matches:set', matches),
    getFriends: () => ipcRenderer.invoke('data:friends'),
    setFriends: (friends) => ipcRenderer.invoke('data:friends:set', friends),
    getRequests: () => ipcRenderer.invoke('data:requests'),
    setRequests: (reqs) => ipcRenderer.invoke('data:requests:set', reqs),
    getBlocked: () => ipcRenderer.invoke('data:blocked'),
    addBlocked: (name) => ipcRenderer.invoke('data:blocked:add', name),
    removeBlocked: (name) => ipcRenderer.invoke('data:blocked:remove', name),
    // news
    getNews: () => ipcRenderer.invoke('news:get'),
    // community: real players / search / invites
    communityStatus: () => ipcRenderer.invoke('community:status'),
    communityDirectory: (q) => ipcRenderer.invoke('community:directory', q),
    communityHeartbeat: (status) => ipcRenderer.invoke('community:heartbeat', status),
    communityInviteCreate: () => ipcRenderer.invoke('community:invite:create'),
    communityInviteResolve: (v) => ipcRenderer.invoke('community:invite:resolve', v),
    communityInviteRedeem: (v) => ipcRenderer.invoke('community:invite:redeem', v),
    communityFriends: () => ipcRenderer.invoke('community:friends'),
    communityFriendAdd: (uid) => ipcRenderer.invoke('community:friend:add', uid),
    communityFriendRemove: (uid) => ipcRenderer.invoke('community:friend:remove', uid),
    communityRequests: () => ipcRenderer.invoke('community:requests'),
    communityRequestSend: (uid) => ipcRenderer.invoke('community:request:send', uid),
    communityRequestResolve: (id, accept) => ipcRenderer.invoke('community:request:resolve', id, accept),
    communityPendingInvite: () => ipcRenderer.invoke('community:invite:pending'),
    communityClearInvite: () => ipcRenderer.invoke('community:invite:clear'),
    communitySetVisible: (v) => ipcRenderer.invoke('community:setVisible', v),
    communityRestartHost: () => ipcRenderer.invoke('community:restartHost'),
    gameNetworkState: () => ipcRenderer.invoke('community:gameState'),
    gameNetworkRefresh: () => ipcRenderer.invoke('community:gameRefresh'),
    gameNetworkConfig: (p) => ipcRenderer.invoke('community:gameConfig', p),
    onGameNetworkUpdate: (cb) => ipcRenderer.on('community:gameUpdate', cb),
    onCommunityUpdate: (cb) => ipcRenderer.on('community:update', cb),
    onCommunityInvite: (cb) => ipcRenderer.on('community:invite', cb),
    // build / updates
    appBuildInfo: () => ipcRenderer.invoke('app:buildInfo'),
    appOpenInstaller: () => ipcRenderer.invoke('app:openInstaller'),
    // events
    onGameStatus: (cb) => ipcRenderer.on('game:status', cb),
    onGameExit: (cb) => ipcRenderer.on('game:exit', cb),
    onGameLog: (cb) => ipcRenderer.on('game:log', cb),
    onToast: (cb) => ipcRenderer.on('toast', cb)
};
contextBridge.exposeInMainWorld('api', api);
