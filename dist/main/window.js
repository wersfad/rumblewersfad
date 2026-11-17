import { BrowserWindow, screen, ipcMain, nativeImage } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const join = path.join;
export function createWindow() {
    const primary = screen.getPrimaryDisplay();
    const ico = path.join(process.resourcesPath, 'game-window-icon.ico');
    const windowIcon = nativeImage.createFromPath(ico);
    const win = new BrowserWindow({
        width: 1366,
        height: 820,
        minWidth: 1100,
        minHeight: 680,
        frame: false,
        title: 'Rumblewersfad Launcher',
        icon: windowIcon.isEmpty() ? join(__dirname, '../../assets/icon.png') : windowIcon,
        trafficLightPosition: { x: 14, y: 14 },
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            preload: join(__dirname, '../preload/preload.mjs'),
            backgroundThrottling: true
        },
        backgroundMaterial: 'acrylic',
        roundedCorners: true,
        hasShadow: true,
        vibrancy: 'under-window',
        transparent: true
    });
    if (!windowIcon.isEmpty()) win.setIcon(windowIcon);
    if (process.platform === 'win32') {
      win.setAppDetails({ appId: 'com.rumblewersfad.launcher', appIconPath: ico, appIconIndex: 0,
        relaunchCommand: '"' + process.execPath + '"', relaunchDisplayName: 'Rumblewersfad Launcher' });
    }
    win.webContents.on('page-title-updated', event => { event.preventDefault(); win.setTitle('Rumblewersfad Launcher'); });
    // Title bar controls
    win.on('minimize', () => {
        win.webContents.send('window:minimize');
    });
    win.on('maximize', () => {
        win.webContents.send('window:maximize');
    });
    win.on('unmaximize', () => {
        win.webContents.send('window:unmaximize');
    });
    win.on('restore', () => {
        win.webContents.send('window:restore');
    });
    return win;
}
let savedBounds = null;
export function registerWindowIpc(window) {
    ipcMain.on('window:minimize', () => window.minimize());
    // На frameless+transparent окнах win.maximize() на Windows — no-op,
    // поэтому переключаем вручную: сравниваем текущие bounds с workArea.
    ipcMain.on('window:maximize', () => {
        const area = screen.getPrimaryDisplay().workArea;
        const b = window.getBounds();
        const isFull = b.width >= area.width - 2 && b.height >= area.height - 2 &&
            Math.abs(b.x - area.x) <= 2 && Math.abs(b.y - area.y) <= 2;
        if (isFull) {
            window.setBounds(savedBounds ?? { x: 277, y: 106, width: 1366, height: 820 });
            savedBounds = null;
            window.webContents.send('window:unmaximize');
        }
        else {
            savedBounds = b;
            window.setBounds({ x: area.x, y: area.y, width: area.width, height: area.height });
            window.webContents.send('window:maximize');
        }
    });
    ipcMain.on('window:close', () => window.close());
    ipcMain.on('window:toggle-tray', (_e, closeToTray) => {
        if (closeToTray) {
            window.hide();
        }
        else {
            window.show();
        }
    });
}
