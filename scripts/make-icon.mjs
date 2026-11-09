// Обёртка PNG (256x256, сгенерированного GDI+) в валидный .ico (PNG-in-ICO, Vista+).
// Запуск: npm run make:icon  (после scripts/make-icon-png.ps1 или с готовым icon.png)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pngPath = join(root, 'assets/icon.png');
const icoPath = join(root, 'assets/icon.ico');

if (!existsSync(pngPath)) {
  console.error('assets/icon.png not found. Run scripts/make-icon-png.ps1 first.');
  process.exit(1);
}

const png = readFileSync(pngPath);

// ICO header: reserved=0, type=1 (icon), count=1
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

// Directory entry (16 bytes): width, height (0 = 256), colors=0, reserved=0,
// planes=1, bitcount=32, size of png data, offset=22
const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0); // 256 -> 0
entry.writeUInt8(0, 1);
entry.writeUInt8(0, 2);
entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12);

writeFileSync(icoPath, Buffer.concat([header, entry, png]));
console.log('icon.ico written,', png.length, 'bytes png payload');
