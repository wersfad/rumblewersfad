import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';
import type { MatchRecord } from '../providers/matchesProvider';

const PlayerStats: React.FC = () => {
  const { settings, matches } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const [nick, setNick] = useState('');
  const [remote, setRemote] = useState<any>(null);
  const [error, setError] = useState('');

  const search = async () => {
    setError('');
    setRemote(null);
    if (!nick.trim()) return;
    if (settings?.dataSource === 'remote') {
      try {
        const res = await fetch(`${settings.apiBaseUrl.replace(/\/$/, '')}/players/${encodeURIComponent(nick.trim())}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setRemote(await res.json());
      } catch (e: any) {
        setError(e?.message ?? 'Request failed');
      }
    }
  };

  // Локальная агрегация по матчам текущего профиля
  const ms = matches as MatchRecord[];
  const wins = ms.filter((m) => m.result === 'win').length;
  const elims = ms.reduce((a, m) => a + (m.eliminations ?? 0), 0);
  const avgPlace = ms.length ? (ms.reduce((a, m) => a + (m.placement ?? 0), 0) / ms.length).toFixed(1) : '—';
  const winRate = ms.length ? Math.round((wins / ms.length) * 100) : 0;
  const kd = ms.length ? (elims / Math.max(1, ms.length - wins)).toFixed(2) : '—';

  const stats = remote ?? {
    nickname: nick || settings?.profileName || 'Player',
    matches: ms.length, wins, eliminations: elims, winRate, avgPlacement: avgPlace, kd
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="font-display text-3xl skew-display mb-5">{t(lang, 'stats')}</div>

      <div className="flex gap-2 max-w-xl mb-6">
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          placeholder={t(lang, 'searchPlayers')}
          className="flex-1 glass-card !rounded-full px-4 py-2.5 text-sm outline-none border-white/10 placeholder:text-white/35"
        />
        <button onClick={() => void search()} className="btn-accent rounded-full px-6 font-bold text-sm">
          {lang === 'ru' ? 'Найти' : 'Search'}
        </button>
      </div>

      {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6 max-w-3xl">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-display text-3xl" style={{ background: 'var(--accent-grad)', boxShadow: 'var(--card-shadow)' }}>
            {(stats.nickname ?? 'P').slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-display text-2xl skew-display">{stats.nickname}</div>
            <div className="text-xs text-white/40">
              {settings?.dataSource === 'remote' ? 'Remote API' : 'Local data'} · {settings?.region ?? 'auto'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ['matchesCount', stats.matches ?? 0],
            ['wins', stats.wins ?? 0],
            ['eliminations', stats.eliminations ?? 0],
            ['winRate', (stats.winRate ?? 0) + '%'],
            ['avgPlacement', stats.avgPlacement ?? '—'],
            ['kd', stats.kd ?? '—']
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-white/5 border border-white/10 p-4 text-center">
              <div className="font-display text-2xl">{v}</div>
              <div className="text-[11px] text-white/50 mt-1 uppercase tracking-wide">
                {k === 'avgPlacement' ? (lang === 'ru' ? 'Среднее место' : 'Avg place') : k === 'kd' ? 'K/D' : t(lang, k as string)}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default PlayerStats;
