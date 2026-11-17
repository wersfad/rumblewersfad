import { Tray, Menu, app } from 'electron';
import { join } from 'node:path';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let tray = null;
export function createTray(window) {
    if (tray)
        return tray;
    tray = new Tray(join(__dirname, '../../assets/icon.png'));
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Show', click: () => window.show() },
        { label: 'Quit', click: () => app.quit() }
    ]));
    tray.on('click', () => window.show());
    return tray;
}
export function destroyTray() {
    if (tray) {
        tray.destroy();
        tray = null;
    }
}
