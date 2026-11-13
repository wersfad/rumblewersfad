import fs from "node:fs/promises";
import path from "node:path";
const MAX_FILE_BYTES = 128 * 1024;
const MAX_PASS_BYTES = 512 * 1024;
const MAX_FILES = 16;
const OVERLAP_BYTES = 512;
const stamps = /* @__PURE__ */ new Map();
let rootsKey = "";
let cacheGeneration = 0;
function resetBackgroundLogCache() {
  cacheGeneration++;
  stamps.clear();
  rootsKey = "";
}
async function readChangedLogTails(roots) {
  const key = JSON.stringify(roots);
  if (rootsKey !== key) {
    cacheGeneration++;
    stamps.clear();
    rootsKey = key;
  }
  const generation = cacheGeneration;
  const candidates = [];
  for (const root of roots) {
    try {
      const dir = await fs.opendir(root);
      for await (const entry of dir) {
        if (!entry.isFile() || !/\.(log|txt|json|ini)$/i.test(entry.name)) continue;
        const file = path.join(root, entry.name);
        try {
          const stat = await fs.stat(file);
          if (!stat.isFile()) continue;
          candidates.push({ file, stamp: {
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            ctimeMs: stat.ctimeMs,
            ino: stat.ino
          } });
          candidates.sort((a, b) => b.stamp.mtimeMs - a.stamp.mtimeMs || a.file.localeCompare(b.file));
          if (candidates.length > MAX_FILES) candidates.pop();
        } catch {
        }
      }
    } catch {
    }
  }
  if (rootsKey !== key || generation !== cacheGeneration) return [];
  const selected = new Set(candidates.map((c) => c.file));
  for (const file of stamps.keys()) if (!selected.has(file)) stamps.delete(file);
  const result = [];
  let budget = MAX_PASS_BYTES;
  for (const { file, stamp } of candidates) {
    if (rootsKey !== key || generation !== cacheGeneration || budget <= 0) break;
    const previous = stamps.get(file);
    if (previous && previous.size === stamp.size && previous.mtimeMs === stamp.mtimeMs && previous.ctimeMs === stamp.ctimeMs && previous.ino === stamp.ino) continue;
    const appended = previous && stamp.ino === previous.ino && stamp.size > previous.size;
    const start = Math.max(
      0,
      stamp.size - Math.min(MAX_FILE_BYTES, budget),
      appended ? previous.size - OVERLAP_BYTES : 0
    );
    let handle;
    try {
      handle = await fs.open(file, "r");
      const before = await handle.stat();
      if (!before.isFile() || before.ino !== stamp.ino || before.size < stamp.size || before.mtimeMs !== stamp.mtimeMs || before.ctimeMs !== stamp.ctimeMs) continue;
      const buffer = Buffer.alloc(stamp.size - start);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const read = await handle.read(buffer, bytesRead, buffer.length - bytesRead, start + bytesRead);
        if (!read.bytesRead) break;
        bytesRead += read.bytesRead;
      }
      budget -= bytesRead;
      const after = await handle.stat();
      if (after.size !== stamp.size || after.mtimeMs !== stamp.mtimeMs || after.ctimeMs !== stamp.ctimeMs) continue;
      if (rootsKey !== key || generation !== cacheGeneration) break;
      stamps.set(file, stamp);
      if (bytesRead) result.push({ file, text: buffer.subarray(0, bytesRead).toString("utf8") });
    } catch {
    } finally {
      await handle?.close().catch(() => {
      });
    }
  }
  return result;
}
export {
  readChangedLogTails,
  resetBackgroundLogCache
};
