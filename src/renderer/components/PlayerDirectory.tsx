import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';
import { community, lastSeenLabel, type CommunityPlayer } from '../providers/communityProvider';
import { api } from '../api/api';

const SOURCE_LABEL: Record<string, { ru: string; en: string }> = {
  presence: { ru: 'в сети лаунчера', en: 'launcher network' },
  game: { ru: 'аккаунт в игре', en: 'game account' },
  server: { ru: 'игровой сервер', en: 'game server' },
  log: { ru: 'из матча', en: 'from match log' },
  local: { ru: 'друг', en: 'friend' }
};

type Filter = 'all' | 'online' | 'inGame';

const statusDot = (s: CommunityPlayer['status']) =>
  s === 'inGame' ? 'bg-amber-400' : s === 'online' ? 'bg-emerald-400' : 'bg-white/25';

/**
 * Каталог всех реальных игроков сети. Показывает всех, кто когда-либо
 * заходил в лаунчер (с текущим онлайн/офлайн статусом), с живым поиском.
 */
const PlayerDirectory: React.FC = () => {
  const { settings, toast, refreshFriends, directoryQuery, setDirectoryQuery } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const [players, setPlayers] = useState<CommunityPlayer[]>([]);
  const [q, setQ] = useState(directoryQuery ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [reachable, setReachable] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [gameState, setGameState] = useState<{ totalPlayers: number | null; identity?: { cozmoId?: string; username?: string }; wsConnected?: boolean } | null>(null);

  // Глобальный поиск (TopBar) пробрасывает сюда запрос и переключает вкладку
  useEffect(() => { setQ(directoryQuery ?? ''); }, [directoryQuery]);

  const load = useCallback(async () => {
    try {
      const [list, status, gs] = await Promise.all([
        community.directory(''),
        community.status(),
        api.gameNetworkState?.().catch(() => null) ?? Promise.resolve(null)
      ]);
      setPlayers(list ?? []);
      setReachable(!!status?.reachable);
      if (gs) setGameState(gs);
    } catch {
      setReachable(false);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 10_000);       // живое обновление статусов
    const onUp = () => void load();
    community.onUpdate(onUp);
    return () => { clearInterval(iv); };
  }, [load]);

  const visible = useMemo(() => {
    const query = q.trim().toLowerCase();
    return players
      .filter((p) => !query || p.nickname.toLowerCase().includes(query) || (p.playerId ?? '').toLowerCase().includes(query))
      .filter((p) => filter === 'all' || (filter === 'online' ? p.status !== 'offline' : p.status === 'inGame'));
  }, [players, q, filter]);

  const onlineCount = players.filter((p) => p.status !== 'offline').length;
  const inGameCount = players.filter((p) => p.status === 'inGame').length;

  const send = async (p: CommunityPlayer) => {
    try {
      await community.sendRequest(p.uid);
      setPending((s) => new Set(s).add(p.uid));
      toast('success', lang === 'ru' ? `Заявка отправлена: ${p.nickname}` : `Request sent: ${p.nickname}`);
      await refreshFriends();
    } catch (e: any) {
      toast('error', e?.message ?? 'Failed');
    }
  };

  return (
    <div className="max-w-4xl">
      {/* Сводка + поиск */}
      <div className="glass-card p-3 mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="font-semibold">{onlineCount}</span>
          <span className="text-white/45">{lang === 'ru' ? 'онлайн' : 'online'}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span className="font-semibold">{inGameCount}</span>
          <span className="text-white/45">{lang === 'ru' ? 'в игре' : 'in game'}</span>
        </div>
        <div className="text-[10px] font-mono text-white/30 ml-1">
          {reachable ? (lang === 'ru' ? '● подключено' : '● connected') : (lang === 'ru' ? '○ нет связи с сервером' : '○ server offline')}
        </div>

        <div className="flex-1 min-w-[180px] flex items-center gap-2 rounded-full bg-black/25 border border-white/10 px-3 py-1.5">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white/40 shrink-0">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input value={q} onChange={(e) => { setQ(e.target.value); setDirectoryQuery(e.target.value); }}
            placeholder={lang === 'ru' ? 'Поиск по нику, #ID или cozmo_id…' : 'Search by name, #ID or cozmo_id…'}
            className="bg-transparent outline-none text-xs w-full placeholder:text-white/25 text-white"
            style={{ fontFamily: 'var(--font-ui)', textTransform: 'none' }} />
          {q && <button onClick={() => { setQ(''); setDirectoryQuery(''); }} className="text-white/35 hover:text-white text-xs">✕</button>}
        </div>

        <div className="flex gap-1">
          {(['all', 'online', 'inGame'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${filter === f ? 'text-white' : 'text-white/45 bg-white/5 hover:text-white'}`}
              style={filter === f ? { background: 'var(--accent-grad)' } : undefined}>
              {f === 'all' ? t(lang, 'all') : f === 'online' ? t(lang, 'online') : t(lang, 'inGame')}
            </button>
          ))}
        </div>
      </div>

      {/* Статус источников: реальные данные из игры */}
      <div className="flex items-center gap-2 mb-3 flex-wrap text-[10px]">
        <span className="px-2 py-1 rounded-full bg-violet-500/10 border border-violet-400/20 text-violet-200">
          {lang === 'ru' ? 'Источники: лаунчер + игра + логи матчей + друзья' : 'Sources: launcher + game + match logs + friends'}
        </span>
        {gameState?.totalPlayers != null && (
          <span className="px-2 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-200">
            {lang === 'ru' ? 'Игроков на серверах игры' : 'Players on game servers'}: {gameState.totalPlayers}
          </span>
        )}
        {gameState?.identity?.cozmoId && (
          <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-white/55 font-mono">
            cozmo: {gameState.identity.cozmoId}
          </span>
        )}
        <button onClick={() => void load()}
          className="px-2 py-1 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-white/60">
          {lang === 'ru' ? 'Обновить' : 'Refresh'}
        </button>
      </div>

      {!reachable && (
        <div className="glass-card p-3 mb-3 text-[11px] text-amber-200/80 border border-amber-300/15">
          {lang === 'ru'
            ? 'Сервер присутствия недоступен — но поиск всё равно работает по аккаунтам игры, логам матчей и друзьям. Чтобы видеть других игроков в реальном времени, включите «Сервер сообщества» в Настройках или укажите общий URL.'
            : 'Presence server is offline — search still works over game accounts, match logs and friends. Enable the community server or set a shared URL for live players.'}
        </div>
      )}

      {loading ? (
        <div className="glass-card p-10 text-center text-white/40 text-sm">…</div>
      ) : visible.length === 0 ? (
        <div className="glass-card p-10 flex flex-col items-center gap-2 text-center">
          <div className="text-white/60 text-sm">
            {q ? (lang === 'ru' ? 'Никого не нашлось' : 'No players found') : (lang === 'ru' ? 'Каталог пока пуст' : 'Directory is empty')}
          </div>
          <div className="text-white/35 text-[11px] max-w-md">
            {lang === 'ru'
              ? 'Игроки появляются здесь, когда запускают этот лаунчер и подключены к тому же серверу сообщества.'
              : 'Players appear here when they run this launcher connected to the same community server.'}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {visible.map((p, i) => (
            <motion.div key={p.uid} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className="glass-card hoverable p-3 flex items-center gap-3">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-display text-base"
                  style={{ background: p.avatarColor ?? '#8B5CF6' }}>
                  {p.nickname.slice(0, 1).toUpperCase()}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1c1038] ${statusDot(p.status)}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{p.nickname}</div>
                <div className="text-[10px] text-white/40 truncate">
                  <span className="font-mono">#{p.playerId}</span>
                  {' · '}
                  {p.status === 'offline'
                    ? lastSeenLabel(p.lastSeen, lang)
                    : p.status === 'inGame' ? t(lang, 'inGame') : t(lang, 'online')}
                </div>
                <div className="text-[9px] text-violet-300/70 truncate">
                  {p.source ? (SOURCE_LABEL[p.source]?.[lang] ?? p.source) : ''}
                  {p.detail ? ` · ${p.detail}` : ''}
                </div>
              </div>
              <button onClick={() => void send(p)} disabled={pending.has(p.uid)}
                title={lang === 'ru' ? 'Отправить заявку в друзья' : 'Send friend request'}
                className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-violet-500/30 transition-colors disabled:opacity-40 shrink-0">
                {pending.has(p.uid) ? '✓' : '+'}
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlayerDirectory;
