import { api } from '../api/api';

export interface MatchRecord {
  id: string;
  date: string; // ISO
  mode: string;
  placement: number;
  eliminations: number;
  durationSec: number;
  result: 'win' | 'loss';
  map?: string;
}

export interface MatchesProvider {
  list(): Promise<MatchRecord[]>;
  add(m: Omit<MatchRecord, 'id'>): Promise<MatchRecord[]>;
  remove(id: string): Promise<MatchRecord[]>;
  importJson(text: string): Promise<number>;
  exportJson(): Promise<string>;
}

/** Локальное хранилище через electron-store (main process). */
export class LocalMatchesProvider implements MatchesProvider {
  async list(): Promise<MatchRecord[]> {
    return (await api.getMatches()) as MatchRecord[];
  }
  async add(m: Omit<MatchRecord, 'id'>): Promise<MatchRecord[]> {
    const all = await this.list();
    const next = [...all, { ...m, id: crypto.randomUUID() }];
    return (await api.setMatches(next)) as MatchRecord[];
  }
  async remove(id: string): Promise<MatchRecord[]> {
    const next = (await this.list()).filter((m) => m.id !== id);
    return (await api.setMatches(next)) as MatchRecord[];
  }
  async importJson(text: string): Promise<number> {
    const parsed = JSON.parse(text);
    const arr: MatchRecord[] = Array.isArray(parsed) ? parsed : parsed.matches ?? [];
    const all = await this.list();
    const merged = [...all, ...arr.map((m) => ({ ...m, id: m.id ?? crypto.randomUUID() }))];
    await api.setMatches(merged);
    return arr.length;
  }
  async exportJson(): Promise<string> {
    return JSON.stringify(await this.list(), null, 2);
  }
}

/** REST API: GET/POST/DELETE {base}/matches */
export class RemoteMatchesProvider implements MatchesProvider {
  constructor(private baseUrl: string) {}
  private url() { return this.baseUrl.replace(/\/$/, '') + '/matches'; }

  async list(): Promise<MatchRecord[]> {
    const res = await fetch(this.url());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  async add(m: Omit<MatchRecord, 'id'>): Promise<MatchRecord[]> {
    const res = await fetch(this.url(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(m)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return this.list();
  }
  async remove(id: string): Promise<MatchRecord[]> {
    const res = await fetch(`${this.url()}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return this.list();
  }
  async importJson(text: string): Promise<number> {
    const parsed = JSON.parse(text);
    const arr: MatchRecord[] = Array.isArray(parsed) ? parsed : parsed.matches ?? [];
    for (const m of arr) await this.add(m);
    return arr.length;
  }
  async exportJson(): Promise<string> {
    return JSON.stringify(await this.list(), null, 2);
  }
}

export function createMatchesProvider(dataSource: 'local' | 'remote', apiBaseUrl: string): MatchesProvider {
  return dataSource === 'remote' ? new RemoteMatchesProvider(apiBaseUrl) : new LocalMatchesProvider();
}
