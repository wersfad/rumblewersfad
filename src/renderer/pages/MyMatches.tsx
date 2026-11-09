import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';
import { createMatchesProvider, MatchRecord } from '../providers/matchesProvider';

type Filter = 'all' | 'win' | 'loss';

const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const MyMatches: React.FC = () => {
  const { settings, matches, refreshMatches, toast } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sortDesc, setSortDesc] = useState(true);
  const [selected, setSelected] = useState<MatchRecord | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const provider = useMemo(
    () => createMatchesProvider(settings?.dataSource ?? 'local', settings?.apiBaseUrl ?? ''),
    [settings?.dataSource, settings?.apiBaseUrl]
  );

  const list = useMemo(() => {
    let ms = [...(matches as MatchRecord[])];
    if (filter !== 'all') ms = ms.filter((m) => m.result === filter);
    if (query.trim()) ms = ms.filter((m) => (m.mode ?? '').toLowerCase().includes(query.toLowerCase()));
    ms.sort((a, b) => (sortDesc ? 1 : -1) * (new Date(a.date).getTime() - new Date(b.date).getTime()));
    return ms;
  }, [matches, filter, query, sortDesc]);

  const wins = (matches as MatchRecord[]).filter((m) => m.result === 'win').length;
  const elims = (matches as MatchRecord[]).reduce((a, m) => a + (m.eliminations ?? 0), 0);
  const avgPlace = matches.length
    ? ((matches as MatchRecord[]).reduce((a, m) => a + (m.placement ?? 0), 0) / matches.length).toFixed(1)
    : '—';
  const winRate = matches.length ? Math.round((wins / matches.length) * 100) : 0;
  const last20 = [...(matches as MatchRecord[])].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 20).reverse();
  const maxPlace = Math.max(40, ...last20.map((m) => m.placement || 1));

  const addManual = async (m: Omit<MatchRecord, 'id'>) => {
    try {
      await provider.add(m);
      await refreshMatches();
      toast('success', 'Match added');
    } catch (e: any) {
      toast('error', e?.message ?? 'Failed');
    }
  };
  const remove = async (id: string) => {
    try {
      await provider.remove(id);
      await refreshMatches();
      setSelected(null);
    } catch (e: any) {
      toast('error', e?.message ?? 'Failed');
    }
  };
  const exportJson = async () => {
    const text = await provider.exportJson();
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rumblewersfad-matches.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f: File) => {
    try {
      const n = await provider.importJson(await f.text());
      await refreshMatches();
      toast('success', `Imported ${n} matches`);
    } catch (e: any) {
      toast('error', e?.message ?? 'Import failed');
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-display text-3xl skew-display">{t(lang, 'matches')}</div>
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(true)} className="btn-accent rounded-lg px-3 py-1.5 text-xs font-bold">{t(lang, 'addMatch')}</button>
            <button onClick={() => fileRef.current?.click()} className="glass-card rounded-lg px-3 py-1.5 text-xs font-bold text-white/70 hover:text-white">Import</button>
            <button onClick={() => void exportJson()} className="glass-card rounded-lg px-3 py-1.5 text-xs font-bold text-white/70 hover:text-white">Export</button>
            <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
          </div>
        </div>

        {/* Сводка */}
        <div className="glass-card p-4 mb-4 grid grid-cols-5 gap-3 items-center">
          {[
            [t(lang, 'matchesCount'), matches.length],
            [t(lang, 'wins'), wins],
            [t(lang, 'eliminations'), elims],
            [t(lang, 'winRate'), winRate + '%'],
            [lang === 'ru' ? 'Среднее место' : 'Avg place', avgPlace]
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <div className="font-display text-xl">{v}</div>
              <div className="text-[10px] text-white/50 uppercase tracking-wide">{k}</div>
            </div>
          ))}
        </div>

        {/* Мини-график последних 20 матчей */}
        {last20.length > 0 && (
          <div className="glass-card p-4 mb-4">
            <div className="text-xs text-white/50 mb-2">{lang === 'ru' ? 'Последние 20 матчей (место)' : 'Last 20 matches (placement)'}</div>
            <div className="flex items-end gap-1 h-20">
              {last20.map((m) => (
                <div
                  key={m.id}
                  title={`${new Date(m.date).toLocaleDateString()} — #${m.placement}`}
                  className="flex-1 rounded-t-sm min-w-1"
                  style={{
                    height: `${Math.max(6, (1 - m.placement / maxPlace) * 100)}%`,
                    background: m.result === 'win' ? 'linear-gradient(180deg,var(--accent-2),var(--accent-1))' : 'rgba(255,255,255,0.18)'
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Фильтры */}
        <div className="flex gap-2 mb-3 items-center">
          {(['all', 'win', 'loss'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filter === f ? 'text-white' : 'text-white/50 hover:text-white bg-white/5'}`}
              style={filter === f ? { background: 'var(--accent-grad)' } : undefined}
            >
              {f === 'all' ? t(lang, 'all') : f === 'win' ? t(lang, 'winsOnly') : t(lang, 'lossesOnly')}
            </button>
          ))}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mode…"
            className="ml-2 flex-1 max-w-[180px] glass-card !rounded-full px-3 py-1.5 text-xs outline-none border-white/10" />
          <button onClick={() => setSortDesc((v) => !v)} className="text-xs text-white/50 hover:text-white">
            {sortDesc ? '↓ date' : '↑ date'}
          </button>
        </div>

        {/* Список */}
        {list.length === 0 ? (
          <div className="glass-card p-10 flex flex-col items-center gap-4 text-center">
            <svg viewBox="0 0 120 90" className="w-32 opacity-70">
              <defs>
                <linearGradient id="empty-g" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#8B5CF6" /><stop offset="100%" stopColor="#4C1D95" />
                </linearGradient>
              </defs>
              <rect x="10" y="18" width="100" height="56" rx="10" fill="url(#empty-g)" opacity="0.85" />
              <path d="M35 62 48 42l12 12 8-8 17 16z" fill="#fff" opacity="0.5" />
              <circle cx="78" cy="34" r="6" fill="#fff" opacity="0.7" />
              <path d="M60 4v8M38 10l4 6M82 10l-4 6" stroke="#A78BFA" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div className="text-white/60 text-sm max-w-xs">{t(lang, 'noMatches')}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((m, i) => (
              <motion.button
                key={m.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.02 }}
                onClick={() => setSelected(m)}
                className="glass-card hoverable flex items-center gap-4 px-4 py-3 text-left"
              >
                <span className={`w-16 text-center font-display text-lg ${m.result === 'win' ? 'text-emerald-400' : 'text-red-400'}`}>
                  #{m.placement}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{m.mode}</div>
                  <div className="text-[11px] text-white/40">{new Date(m.date).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')}</div>
                </div>
                <div className="text-center w-14">
                  <div className="text-sm font-bold">{m.eliminations}</div>
                  <div className="text-[10px] text-white/40 uppercase">elims</div>
                </div>
                <div className="text-sm text-white/60 w-14 text-center">{fmtDur(m.durationSec)}</div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${m.result === 'win' ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30' : 'bg-red-400/15 text-red-300 border border-red-400/30'}`}>
                  {m.result === 'win' ? 'WIN' : 'LOSS'}
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Боковая панель деталей */}
      <AnimatePresence>
        {selected && (
          <motion.aside
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="w-[300px] shrink-0 border-l border-white/10 bg-black/20 backdrop-blur-xl p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <div className="font-display text-xl skew-display">{lang === 'ru' ? 'Детали матча' : 'Match details'}</div>
              <button onClick={() => setSelected(null)} className="text-white/50 hover:text-white text-lg">✕</button>
            </div>
            <div className={`rounded-xl p-4 text-center font-display text-3xl skew-display ${selected.result === 'win' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300'}`}>
              {selected.result === 'win' ? 'WIN' : 'LOSS'} · #{selected.placement}
            </div>
            {[
              ['Mode', selected.mode],
              [lang === 'ru' ? 'Дата' : 'Date', new Date(selected.date).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')],
              [lang === 'ru' ? 'Место' : 'Placement', '#' + selected.placement],
              [lang === 'ru' ? 'Элиминации' : 'Eliminations', selected.eliminations],
              [lang === 'ru' ? 'Длительность' : 'Duration', fmtDur(selected.durationSec)],
              ['Map', selected.map ?? '—']
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between text-sm border-b border-white/5 pb-2">
                <span className="text-white/50">{k}</span>
                <span className="font-semibold">{v}</span>
              </div>
            ))}
            <button onClick={() => void remove(selected.id)} className="mt-auto rounded-xl py-2 text-xs font-bold bg-red-400/15 text-red-300 border border-red-400/30 hover:bg-red-400/25 transition-colors">
              {t(lang, 'remove')}
            </button>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Модалка добавления матча */}
      <AnimatePresence>
        {showAdd && <AddMatchModal lang={lang} onClose={() => setShowAdd(false)} onAdd={addManual} />}
      </AnimatePresence>
    </div>
  );
};

const AddMatchModal: React.FC<{
  lang: 'ru' | 'en';
  onClose: () => void;
  onAdd: (m: Omit<MatchRecord, 'id'>) => Promise<void>;
}> = ({ lang, onClose, onAdd }) => {
  const [mode, setMode] = useState('Solo');
  const [placement, setPlacement] = useState(10);
  const [elims, setElims] = useState(3);
  const [dur, setDur] = useState(600);
  const [result, setResult] = useState<'win' | 'loss'>('loss');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="glass-card p-6 w-[360px]" style={{ background: 'rgba(30,18,60,0.92)' }} onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-xl skew-display mb-4">{t(lang, 'addMatch')}</div>
        <div className="flex flex-col gap-3">
          <label className="text-xs text-white/50">Mode
            <input value={mode} onChange={(e) => setMode(e.target.value)} className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none" />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-white/50">#<input type="number" min={1} max={40} value={placement} onChange={(e) => setPlacement(+e.target.value)} className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm outline-none" /></label>
            <label className="text-xs text-white/50">Elims<input type="number" min={0} value={elims} onChange={(e) => setElims(+e.target.value)} className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm outline-none" /></label>
            <label className="text-xs text-white/50">Sec<input type="number" min={0} value={dur} onChange={(e) => setDur(+e.target.value)} className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm outline-none" /></label>
          </div>
          <div className="flex gap-2">
            {(['win', 'loss'] as const).map((r) => (
              <button key={r} onClick={() => setResult(r)}
                className={`flex-1 rounded-lg py-2 text-xs font-bold border ${result === r ? (r === 'win' ? 'bg-emerald-400/20 text-emerald-300 border-emerald-400/40' : 'bg-red-400/20 text-red-300 border-red-400/40') : 'bg-white/5 text-white/50 border-white/10'}`}>
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-1">
            <button onClick={onClose} className="flex-1 rounded-lg py-2 text-xs font-bold bg-white/5 text-white/60 border border-white/10">Cancel</button>
            <button onClick={() => void onAdd({ date: new Date().toISOString(), mode, placement, eliminations: elims, durationSec: dur, result })}
              className="flex-1 btn-accent rounded-lg py-2 text-xs font-bold">{t(lang, 'addMatch')}</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default MyMatches;
