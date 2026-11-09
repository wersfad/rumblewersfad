import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api/api';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';
import AddFriend from '../components/AddFriend';

const card = 'glass-card hoverable p-4';

const Home: React.FC = () => {
  const { settings, gameStatus, folderInfo, matches, setView, toast, refreshFolderInfo, refreshMatches, playerId } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const [news, setNews] = useState<any[]>([]);
  const [online, setOnline] = useState(12480);
  const [repairing, setRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState<number | null>(null);

  useEffect(() => {
    void api.getNews().then((n) => setNews((n ?? []).slice(0, 3)));
    const iv = setInterval(() => setOnline((v) => Math.max(8000, v + Math.floor(Math.random() * 400) - 200)), 3000);
    return () => clearInterval(iv);
  }, []);

  const wins = matches.filter((m: any) => m.result === 'win').length;
  const elims = matches.reduce((a: number, m: any) => a + (m.eliminations ?? 0), 0);
  const winRate = matches.length ? Math.round((wins / matches.length) * 100) : 0;

  const play = async () => {
    if (!folderInfo?.valid) {
      await selectFolder();
      return;
    }
    if (gameStatus === 'running') {
      toast('info', lang === 'ru' ? 'Игра уже запущена' : 'Game is already running');
      return;
    }
    const r = await api.launchGame([]);
    if (!r.success) toast('error', r.error ?? 'Launch failed');
    else toast('success', 'Rumbleverse launched');
  };
  const safePlay = async () => {
    if (!folderInfo?.valid) {
      await selectFolder();
      return;
    }
    const r = await api.safeLaunchGame(settings?.launchArgs ?? []);
    if (!r.success) toast('error', r.error ?? 'Safe launch failed');
    else toast('success', lang === 'ru' ? 'Safe mode запущен' : 'Safe mode launched');
  };
  const selectFolder = async () => {
    const r = await api.selectFolder();
    if (!r.canceled && r.validation) {
      const v: any = r.validation;
      if (v.valid) toast('success', `Game folder set: ${r.folder}`);
      else toast('warning', `Not a game folder: missing ${v.missing.slice(0, 3).join(', ')}`);
      await refreshFolderInfo();
    }
  };
  const repair = async () => {
    setRepairing(true);
    setRepairProgress(0);
    // имитация прогресса параллельно с реальной проверкой
    const iv = setInterval(() => setRepairProgress((p) => (p === null || p >= 95 ? p : p + 5)), 120);
    const r = await api.repairFiles();
    clearInterval(iv);
    setRepairProgress(100);
    setTimeout(() => { setRepairing(false); setRepairProgress(null); }, 600);
    toast(r.ok ? 'success' : 'warning', r.ok ? `All ${r.checked} files OK` : `Missing: ${r.missing.slice(0, 3).join(', ')}`);
  };
  const openLogs = async () => {
    const logs = await api.getLogs();
    toast('info', logs ? `${logs.split('\n').length} log lines loaded` : 'Log is empty');
    setView('settings');
  };

  const quickActions = [
    { label: t(lang, 'selectFolder'), icon: 'folder', action: selectFolder },
    { label: t(lang, 'repairFiles'), icon: 'wrench', action: repair },
    { label: t(lang, 'installFolder'), icon: 'open', action: async () => { const r: any = await api.openFolder(); if (r?.error) toast('error', r.error); } },
    { label: t(lang, 'safeMode'), icon: 'shield', action: safePlay },
    { label: t(lang, 'viewLogs'), icon: 'logs', action: openLogs },
    { label: t(lang, 'settings'), icon: 'gear', action: () => setView('settings') }
  ];
  const qaIcons: Record<string, React.ReactNode> = {
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />,
    wrench: <path d="M14.5 6.5a4.5 4.5 0 0 0-6 5.7L3 17.7 6.3 21l5.5-5.5a4.5 4.5 0 0 0 5.7-6L14 13l-3-3z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />,
    open: <path d="M14 4h6v6M20 4 11 13M9 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
    shield: <path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />,
    logs: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />,
    gear: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  };

  const friends = useAppStore((s) => s.friends);
  const friendsOnline = friends.filter((f: any) => f.status !== 'offline');

  return (
    <div className="flex-1 flex gap-4 p-4 overflow-hidden">
      {/* Левая колонка */}
      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1 min-w-0">
        {/* Баннер */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-theme glass-card p-6 shrink-0"
        >
          <div
            className="absolute inset-0 opacity-40"
            style={{ background: 'radial-gradient(600px 200px at 20% 0%, var(--banner-glow-1), transparent 60%), radial-gradient(500px 220px at 90% 100%, var(--banner-glow-2), transparent 60%)' }}
          />
          <div className="relative">
            <div className="font-display text-4xl skew-display">RUMBLEVERSE</div>
            <div className="text-white/60 text-sm mt-1">Battle royale · 40 players · one winner</div>
            <div className="flex items-center gap-4 mt-4">
              <button onClick={play} disabled={gameStatus === 'running'}
                className="btn-accent play-pulse rounded-xl px-8 py-3 font-display text-lg skew-display disabled:!animate-none">
                {gameStatus === 'running' ? 'RUNNING…' : t(lang, 'playNow')}
              </button>
              <div className="text-sm text-white/70">
                <span className="text-white font-bold text-lg">{online.toLocaleString('ru-RU')}</span> {t(lang, 'onlineNow')}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Game Records */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className={card}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-lg skew-display">{t(lang, 'gameRecords')}</div>
            <button onClick={() => setView('stats')} className="text-xs font-bold text-violet-300 hover:text-white transition-colors">
              {t(lang, 'viewStats')} →
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[['wins', wins], ['eliminations', elims], ['matchesCount', matches.length], ['winRate', winRate + '%']].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <div className="font-display text-2xl">{v}</div>
                <div className="text-[11px] text-white/50 mt-1 uppercase tracking-wide">{t(lang, k as string)}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={card}>
          <div className="font-display text-lg skew-display mb-3">{t(lang, 'quickActions')}</div>
          <div className="grid grid-cols-3 gap-3">
            {quickActions.map((a) => (
              <button key={a.label} onClick={a.action} disabled={a.label === t(lang, 'repairFiles') && repairing}
                className="flex flex-col items-center gap-2 rounded-xl bg-white/5 border border-white/10 py-4 text-xs font-semibold text-white/80 hover:bg-violet-500/20 hover:border-violet-400/30 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(139,92,246,0.35)] active:translate-y-0 active:scale-95">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-violet-300">{qaIcons[a.icon]}</svg>
                {a.label}
              </button>
            ))}
          </div>
          {repairing && (
            <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full progress-animated transition-all duration-150"
                style={{ width: `${repairProgress ?? 0}%`, background: 'var(--accent-grad)' }} />
            </div>
          )}
        </motion.div>

        {/* Latest News */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className={`${card} shrink-0`}>
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-lg skew-display">{t(lang, 'latestNews')}</div>
            <button onClick={() => setView('news')} className="text-xs font-bold text-violet-300 hover:text-white">→</button>
          </div>
          <div className="flex flex-col gap-2">
            {news.map((n) => (
              <div key={n.id} className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'var(--accent-grad)' }}>{n.tag}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{n.title}</div>
                  <div className="text-[11px] text-white/40">{n.date}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Правая панель */}
      <div className="w-[300px] shrink-0 flex flex-col gap-4 overflow-y-auto">
        {/* Профиль: ник в игре (редактируемый) + постоянный ID */}
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-display text-xl shrink-0" style={{ background: 'var(--accent-grad)', boxShadow: 'var(--card-shadow)' }}>
            {(settings?.profileName ?? 'P').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-white/40">{t(lang, 'yourNick')}</div>
            <div className="flex items-center gap-1">
              <input
                key={settings?.profileName}
                defaultValue={settings?.profileName ?? 'Player'}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== settings?.profileName) {
                    void useAppStore.getState().patchSettings({ profileName: v });
                    toast('success', lang === 'ru' ? 'Ник сохранён' : 'Nickname saved');
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder={lang === 'ru' ? 'Твой ник в игре' : 'Your in-game nickname'}
                className="flex-1 min-w-0 bg-white/5 border border-violet-400/25 rounded-lg px-2 py-1 outline-none font-display text-base skew-display placeholder:text-white/30 text-white focus:border-violet-300/60"
                maxLength={24}
              />
              <button
                title={t(lang, 'save')}
                onClick={(e) => {
                  const input = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null);
                  input?.blur();
                }}
                className="btn-accent rounded-lg px-2.5 py-1.5 text-xs shrink-0"
              >
                OK
              </button>
            </div>
            <div className="text-[11px] font-mono text-violet-300/90 truncate mt-0.5" title={playerId ?? ''}>ID {playerId ?? '…'}</div>
          </div>
        </div>

        {/* Добавить друга по нику */}
        <div className="glass-card p-4">
          <div className="text-sm font-bold mb-2">{lang === 'ru' ? 'Добавить друга' : 'Add friend'}</div>
          <AddFriend compact />
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-2.5 h-2.5 rounded-full ${folderInfo?.valid ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-sm font-semibold">
              {folderInfo?.valid ? t(lang, 'readyToLaunch') : t(lang, 'folderNotSelected')}
            </span>
          </div>
          <div className="text-[11px] text-white/40 mb-3 truncate">{folderInfo?.folder ?? '—'}</div>
          <button onClick={play} disabled={gameStatus === 'running'}
            className="btn-accent play-pulse w-full rounded-xl py-3 font-display text-xl skew-display disabled:!animate-none">
            {gameStatus === 'running' ? 'RUNNING…' : t(lang, 'play')}
          </button>
          <button onClick={safePlay} className="mt-2 w-full text-center text-xs text-violet-300 hover:text-white transition-colors active:scale-95 rounded">
            {t(lang, 'safeMode')} →
          </button>
        </div>

        <div className="glass-card p-4">
          <div className="text-sm font-bold mb-2">{t(lang, 'friendsOnline')} ({friendsOnline.length})</div>
          {friendsOnline.length === 0 ? (
            <div className="text-xs text-white/40">—</div>
          ) : (
            <div className="flex flex-col gap-2">
              {friendsOnline.slice(0, 5).map((f: any) => (
                <div key={f.id} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: f.avatarColor ?? '#8B5CF6' }}>
                    {f.nickname.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-sm truncate flex-1">{f.nickname}</span>
                  <span className={`w-2 h-2 rounded-full ${f.status === 'inGame' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-4">
          <div className="text-sm font-bold mb-1">{t(lang, 'helpSupport')}</div>
          <div className="text-xs text-white/50 leading-relaxed">
            {lang === 'ru'
              ? 'Если игра не запускается — выберите папку с Rumbleverse.exe и нажмите Repair Files. Логи доступны в Настройках.'
              : 'If the game does not start — select the folder containing Rumbleverse.exe and press Repair Files. Logs are in Settings.'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
