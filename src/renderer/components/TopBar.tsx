import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';
import { community, type CommunityPlayer } from '../providers/communityProvider';

const regions = [
  { id: 'auto', label: 'Auto' },
  { id: 'eu', label: 'EU' },
  { id: 'na', label: 'NA' },
  { id: 'asia', label: 'Asia' }
];

/**
 * Глобальный поиск игроков. Раньше поле было декоративным: теперь оно
 * реально ищет по объединённому каталогу (presence + игра + логи + друзья),
 * показывает выпадающие результаты и по Enter открывает вкладку «Все игроки».
 */
const TopBar: React.FC = () => {
  const { search, setSearch, region, setRegion, settings, setView, playerId, openPlayerSearch } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const [results, setResults] = useState<CommunityPlayer[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = search.trim();
    if (!q) { setResults([]); setOpen(false); return; }
    let cancelled = false;
    setLoading(true);
    const iv = setTimeout(() => {
      community.directory(q)
        .then((r) => { if (!cancelled) { setResults(r.slice(0, 6)); setOpen(true); } })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 220);
    return () => { cancelled = true; clearTimeout(iv); };
  }, [search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const pick = (p: CommunityPlayer) => {
    setOpen(false);
    openPlayerSearch(p.nickname);
  };

  return (
    <div className="drag-region h-14 flex items-center gap-3 px-4 shrink-0">
      <div ref={boxRef} className="no-drag relative flex items-center gap-2 flex-1 max-w-md glass-card !rounded-full px-4 py-2 border-white/10">
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-white/50 shrink-0"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => { if (results.length) setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); openPlayerSearch(search); setOpen(false); }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder={t(lang, 'searchPlayers')}
          className="bg-transparent outline-none text-sm w-full placeholder:text-white/35 text-white"
        />
        {loading && <span className="text-white/40 text-xs">…</span>}
        {search && (
          <button onClick={() => { setSearch(''); setResults([]); setOpen(false); }} className="text-white/35 hover:text-white text-xs">✕</button>
        )}

        {open && (
          <div className="absolute top-[calc(100%+8px)] left-0 w-full z-50 glass-card p-2 flex flex-col gap-1"
            style={{ background: 'rgba(24,14,48,0.96)' }}>
            {results.length === 0 ? (
              <div className="px-2 py-2 text-[11px] text-white/45">
                {lang === 'ru' ? 'Никого не найдено' : 'No players found'}
              </div>
            ) : results.map((p) => (
              <button key={p.uid} onClick={() => pick(p)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left">
                <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: p.avatarColor ?? '#8B5CF6' }}>
                  {p.nickname.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{p.nickname}</span>
                  <span className="block text-[10px] font-mono text-violet-300/80 truncate">#{p.playerId}</span>
                </span>
                <span className={`text-[10px] shrink-0 ${p.status === 'inGame' ? 'text-amber-300' : p.status === 'online' ? 'text-emerald-300' : 'text-white/35'}`}>
                  {p.status === 'inGame' ? t(lang, 'inGame') : p.status === 'online' ? t(lang, 'online') : t(lang, 'offline')}
                </span>
              </button>
            ))}
            <button onClick={() => openPlayerSearch(search)}
              className="mt-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-center bg-white/5 hover:bg-white/10 text-violet-200">
              {lang === 'ru' ? 'Показать всех игроков →' : 'Show all players →'}
            </button>
          </div>
        )}
      </div>

      <div className="no-drag flex items-center gap-1 glass-card !rounded-full px-2 py-1 border-white/10">
        {regions.map((r) => (
          <button
            key={r.id}
            onClick={() => setRegion(r.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
              region === r.id ? 'text-white' : 'text-white/50 hover:text-white/80'
            }`}
            style={region === r.id ? { background: 'var(--accent-grad)' } : undefined}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <button className="no-drag w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Settings" onClick={() => setView('settings')}>
        <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
      </button>
      <button className="no-drag relative w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors" title="Notifications">
        <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6ZM10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-violet-400" />
      </button>

      <div className="no-drag flex items-center gap-2 pl-1 pr-1 py-1">
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-display text-sm" style={{ background: 'var(--accent-grad)' }}>
          {(settings?.profileName ?? 'P').slice(0, 1).toUpperCase()}
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white max-w-[110px] truncate">{settings?.profileName ?? 'Player'}</div>
          <div className="text-[10px] font-mono text-violet-300/90 tracking-wide">#{playerId ?? '…'}</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> {t(lang, 'online')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopBar;
