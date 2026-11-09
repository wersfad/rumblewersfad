import { app } from 'electron';
import { join } from 'node:path';
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';

export const logPath = join(app.getPath('userData'), 'rumblewersfad.log');

export function ensureLogDir() {
  const dir = join(app.getPath('userData'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  ensureLogDir();
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`;
  appendFileSync(logPath, line, 'utf8');
}

export function readLogs(limit = 5000): string {
  if (!existsSync(logPath)) return '';
  let content = readFileSync(logPath, 'utf8');
  if (content.length > limit) content = content.slice(-limit);
  return content;
}

// Регистрация IPC для логов живёт в ipc.ts; здесь только файловая часть.