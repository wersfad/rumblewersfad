import React from 'react';
import { motion } from 'framer-motion';
import { useAppStore, View } from '../store/useAppStore';
import { t } from '../i18n/i18n';

const icons: Record<View, React.ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v9h13v-9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  news: <path d="M4 5h16v14H4zM4 5l2-2h12l2 2M8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
  stats: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  matches: <path d="M8 4h13v13l-3 3H8zM8 4v16M4 7h4v13H4z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />,
  friends: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 4.5a3.5 3.5 0 0 1 0 6.6M21.5 20c-.5-2.4-2-4-4.2-4.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
  settings: <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />,
  credits: <path d="M12 3l2.5 5.3 5.5.7-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.5-.7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
};

const items: View[] = ['home', 'news', 'stats', 'matches', 'friends', 'settings', 'credits'];

const Sidebar: React.FC = () => {
  const { view, setView, settings, gameStatus, requests } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const keys: Record<View, string> = {
    home: 'home', news: 'news', stats: 'stats', matches: 'matches',
    friends: 'friends', settings: 'settings', credits: 'credits'
  };

  const statusColor =
    gameStatus === 'running' ? 'bg-emerald-400' :
    gameStatus === 'ready' ? 'bg-violet-400' : 'bg-white/30';
  const statusText =
    gameStatus === 'running' ? t(lang, 'running') :
    gameStatus === 'ready' ? t(lang, 'readyToLaunch') : t(lang, 'waitingForGame');

  return (
    <aside className="w-[230px] shrink-0 flex flex-col py-4 px-3 gap-1 border-r border-white/5 bg-black/10">
      <nav className="flex flex-col gap-1">
        {items.map((v) => {
          const active = view === v;
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                active
                  ? 'text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'var(--accent-grad)', boxShadow: 'var(--nav-glow)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <svg viewBox="0 0 24 24" className="relative w-5 h-5 shrink-0">{icons[v]}</svg>
              <span className="relative flex-1 text-left">{t(lang, keys[v])}</span>
              {v === 'friends' && requests.length > 0 && (
                <span className="relative min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-[11px] font-bold flex items-center justify-center text-white">
                  {requests.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-2 pt-3 border-t border-white/5">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className={`w-2 h-2 rounded-full ${statusColor} ${gameStatus === 'running' ? 'animate-pulse' : ''}`} />
          <span className="truncate">{statusText}</span>
        </div>
        <div className="mt-1 text-[11px] text-white/35">Rumblewersfad v1.0.0</div>
      </div>
    </aside>
  );
};

export default Sidebar;
