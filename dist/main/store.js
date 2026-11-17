import Store from 'electron-store';
import crypto from 'node:crypto';
export const defaultSettings = {
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
export const store = new Store({
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
export function getOrCreatePlayerId() {
    let id = store.get('playerId');
    if (!id || !/^\d{3}$/.test(id)) {
        id = String(100 + Math.floor(Math.random() * 900)); // 100..999
        store.set('playerId', id);
    }
    return id;
}
/** Глобально уникальный ID установки. Короткий playerId (3 цифры) показываем
 *  людям, но для каталога нужен настоящий уникальный ключ — иначе два игрока
 *  с одинаковыми цифрами «сольются» в одного. */
export function getOrCreateClientUid() {
    let uid = store.get('clientUid');
    if (!uid || !/^[A-Za-z0-9_-]{6,64}$/.test(uid)) {
        uid = crypto.randomUUID();
        store.set('clientUid', uid);
    }
    return uid;
}
export function getSettings() {
    return { ...defaultSettings, ...store.get('settings') };
}
export function setSettings(patch) {
    const next = { ...getSettings(), ...patch };
    store.set('settings', next);
    return next;
}
