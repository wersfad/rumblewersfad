/* ---------------------------------------------------------------------------
 * Отдельный сервер сообщества (для VPS / общего хоста).
 *
 *   npm run build:electron     # один раз: компилирует src/main → dist/main
 *   npm run server             # поднимает сервер
 *
 * Переменные окружения:
 *   PORT=8787                 порт
 *   HOST=0.0.0.0             адрес (для доступности извне — 0.0.0.0)
 *   RV_COMMUNITY_TOKEN=...    необязательный общий ключ (приватный сервер)
 *   RV_DATA_FILE=./data.json  где хранить каталог игроков
 *
 * После запуска раздайте игрокам URL http://<ваш-хост>:8787 — его нужно
 * вписать в Настройки → Сообщество → URL сервера игроков.
 * ------------------------------------------------------------------------- */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compiled = path.join(__dirname, '../dist/main/presenceServer.js');

if (!fs.existsSync(compiled)) {
  console.error('[presence] dist/main/presenceServer.js не найден.');
  console.error('[presence] Сначала выполните: npm run build:electron');
  process.exit(1);
}

// На Windows динамический import() требует file:// URL, а не "C:\..."
const { startPresenceServer } = await import(pathToFileURL(compiled).href);

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
const token = process.env.RV_COMMUNITY_TOKEN || '';
const dataFile = process.env.RV_DATA_FILE || path.join(__dirname, 'community-data.json');

try {
  const handle = await startPresenceServer({ port, host, token, dataFile });
  console.log(`[presence] Rumblewersfad community server: http://${host}:${handle.port}`);
  console.log(`[presence] data: ${dataFile}`);
  console.log(`[presence] token: ${token ? 'enabled' : 'disabled (public)'}`);
  const stop = () => { handle.hub.broadcast('presence'); handle.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (err) {
  console.error('[presence] failed to start:', err?.message ?? err);
  process.exit(1);
}
