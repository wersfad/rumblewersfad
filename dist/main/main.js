import { brandingReport } from './brandingReport.js';
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWindow, registerWindowIpc } from './window.js';
import { registerIpc } from './ipc.js';
import { registerCommunityIpc, startCommunity, stopCommunity, receiveInvite, INVITE_SCHEME } from './community.js';
import { log } from './logs.js';
import { getSettings, setSettings } from './store.js';
import { autoDetectGameFolder } from './game.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    brandingReport('Another launcher is already running; close the old instance.');
    app.quit();
}
else {
    app.on('second-instance', (_e, argv) => {
        for (const a of argv)
            if (a.startsWith(INVITE_SCHEME + '://'))
                receiveInvite(a);
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
    app.whenReady().then(() => {
        const settings = getSettings();
        app.setLoginItemSettings({ openAtLogin: !!settings.autoStart });
        mainWindow = createWindow();
        brandingReport('Unified build 1.2.0 active.');
        registerWindowIpc(mainWindow);
        registerIpc(() => mainWindow);
        registerCommunityIpc(() => mainWindow);
        void startCommunity().catch((e) => log(`community start failed: ${e?.message ?? e}`, 'warn'));
        // Авто-детект папки игры (например, Downloads\Rumbleverse-client)
        if (!getSettings().gameFolder) {
            void autoDetectGameFolder().then(async (folder) => {
                if (folder) {
                    const { validateGameFolder } = await import('./game.js');
                    const v = await validateGameFolder(folder);
                    if (v.valid && v.executable) {
                        setSettings({ gameFolder: folder, gameExecutable: v.executable });
                        log(`game folder auto-detected: ${folder}`);
                    }
                }
            });
        }
        log('Rumblewersfad started');
        mainWindow.on('close', (e) => {
            const s = getSettings();
            if (s.closeToTray && !app.isQuitting) {
                e.preventDefault();
                mainWindow?.hide();
            }
        });
        mainWindow.on('closed', () => {
            mainWindow = null;
        });
        const isDev = !app.isPackaged;
        if (isDev) {
            const devUrl = 'http://localhost:5173';
            const tryLoad = async (tries = 60) => {
                for (let i = 0; i < tries; i++) {
                    try {
                        const res = await fetch(devUrl);
                        if (res.ok) {
                            await mainWindow.loadURL(devUrl);
                            mainWindow.webContents.openDevTools({ mode: 'detach' });
                            return;
                        }
                    }
                    catch { /* vite not up yet */ }
                    await new Promise((r) => setTimeout(r, 500));
                }
                // fallback to built files
                mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
            };
            void tryLoad();
        }
        else {
            mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
        }
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                mainWindow = createWindow();
            }
        });
    });
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            // stay alive in tray if closeToTray enabled
            const s = getSettings();
            if (!s.closeToTray)
                app.quit();
        }
    });
    app.on('before-quit', () => {
        app.isQuitting = true;
        stopCommunity();
    });
}
