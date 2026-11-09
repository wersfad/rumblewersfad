import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';
import { createFriendsProvider, SearchedUser } from '../providers/friendsProvider';

/**
 * Поиск игроков по нику: вводишь ник — выпадает список совпадений
 * (ник + ID), выбираешь и нажимаешь «Добавить».
 */
const AddFriend: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { settings, refreshFriends, toast } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const provider = useMemo(
    () => createFriendsProvider(settings?.dataSource ?? 'local', settings?.apiBaseUrl ?? '', settings?.wsUrl ?? ''),
    [settings?.dataSource, settings?.apiBaseUrl, settings?.wsUrl]
  );

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    const iv = setTimeout(() => {
      provider
        .searchUsers(query)
        .then(setResults)
        .catch((e) => toast('error', e?.message ?? 'Search failed'))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(iv);
  }, [q, provider]);

  const statusLabel = (s?: string) =>
    s === 'inGame' ? t(lang, 'inGame') : s === 'online' ? t(lang, 'online') : t(lang, 'offline');

  const add = async (u: SearchedUser) => {
    try {
      await provider.addUser(u);
      setAdded((s) => new Set(s).add(u.id));
      toast('success', `${u.nickname} — ${lang === 'ru' ? 'добавлен в друзья' : 'added to friends'}`);
      await refreshFriends();
    } catch (e: any) {
      toast('error', e?.message ?? 'Failed');
    }
  };

  return (
    <div className={compact ? '' : 'relative'}>
      <div className={`flex items-center gap-2 glass-card !rounded-full px-4 py-2 border-white/10 ${compact ? '' : 'w-72'}`}>
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-white/50 shrink-0">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16.5 16.5 21 21M8 11h6M11 8v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={lang === 'ru' ? 'Найти игрока по нику или #ID…' : 'Find player by name or #ID…'}
          className="bg-transparent outline-none text-sm w-full placeholder:text-white/35 text-white normal-case italic-none"
          style={{ fontFamily: 'var(--font-ui)', textTransform: 'none', fontStyle: 'normal' }}
        />
        {loading && <span className="text-white/40 text-xs">…</span>}
      </div>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`glass-card p-2 flex flex-col gap-1 ${compact ? 'mt-2' : 'absolute z-40 mt-2 w-72'}`}
            style={{ background: 'rgba(24,14,48,0.92)' }}
          >
            {results.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0"
                  style={{ background: 'var(--accent-grad)' }}
                >
                  {u.nickname.slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{u.nickname}</div>
                  <div className="text-[10px] font-mono text-violet-300/80 truncate">
                    #{u.playerId ?? u.id.slice(0, 8)} · {statusLabel(u.status)}
                  </div>
                </div>
                <button
                  onClick={() => void add(u)}
                  disabled={added.has(u.id)}
                  className="btn-accent rounded-lg px-2.5 py-1 text-[10px] disabled:opacity-40"
                >
                  {added.has(u.id) ? '✓' : t(lang, 'addFriend')}
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AddFriend;
