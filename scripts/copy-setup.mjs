// После сборки копирует свежий установщик в корень проекта,
// чтобы C:\...\Rumblewersfad\Rumblewersfad-Setup.exe всегда был последней версией.
import { copyFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const release = join(root, 'release');
if (!existsSync(release)) process.exit(0);
const setup = readdirSync(release).find((f) => /^Rumblewersfad-Setup-.*\.exe$/.test(f));
if (setup) {
  copyFileSync(join(release, setup), join(root, 'Rumblewersfad-Setup.exe'));
  console.log('copied', setup, '-> Rumblewersfad-Setup.exe');
}
