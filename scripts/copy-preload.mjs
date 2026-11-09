// tsc кладёт preload как .js (ESM из-за "type": "module"), а Electron
// для ESM-preload требует расширение .mjs. Копируем после сборки.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'dist/preload/preload.js');
const dst = join(root, 'dist/preload/preload.mjs');
if (!existsSync(src)) {
  console.error('dist/preload/preload.js not found — run tsc first');
  process.exit(1);
}
mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log('preload.mjs written');
