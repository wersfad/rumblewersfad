import path from 'node:path';
import fs from 'node:fs';

/** Абсолютный путь без symlink-обмана внутри base. Бросает ошибку, если путь вне base. */
export function safeJoin(base: string, rel: string): string {
  const resolved = path.resolve(base, rel);
  let baseResolved = path.resolve(base);
  if (baseResolved.endsWith(path.sep)) baseResolved = baseResolved.slice(0, -1);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    throw new Error(`Path escapes allowed directory: ${rel}`);
  }
  return resolved;
}

export function isAbsolute(p: string): boolean {
  return path.isAbsolute(p);
}

export function exists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Рекурсивный размер папки в байтах. */
export async function folderSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await folderSize(p);
    else if (e.isFile()) {
      try {
        total += (await fs.promises.stat(p)).size;
      } catch {
        /* файл мог исчезнуть */
      }
    }
  }
  return total;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
