import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';
import { createFriendsProvider, Friend, FriendRequest } from '../providers/friendsProvider';
import { community, type CommunityRequest } from '../providers/communityProvider';
import AddFriend from '../components/AddFriend';
import InviteCard from '../components/InviteCard';
import PlayerDirectory from '../components/PlayerDirectory';

type Tab = 'players' | 'all' | 'online' | 'requests' | 'blocked';

const statusLabel = (lang: 'ru' | 'en', s: string) =>
  s === 'online' ? t(lang, 'online') : s === 'inGame' ? t(lang, 'inGame') : t(lang, 'offline');

const statusDot = (s: string) =>
  s === 'online' ? 'bg-emerald-400' : s === 'inGame' ? 'bg-amber-400' : 'bg-white/25';

const Friends: React.FC = () => {
  const { settings, friends, requests, blocked, refreshFriends, toast, playerId } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const [tab, setTab] = useState<Tab>('players');
  const [liveRequests, setLiveRequests] = useState<CommunityRequest[]>([]);
  const [selfUid, setSelfUid] = useState<string>('');

  const provider = useMemo(
    () => createFriendsProvider(settings?.dataSource ?? 'local', settings?.apiBaseUrl ?? '', settings?.wsUrl ?? ''),
    [settings?.dataSource, settings?.apiBaseUrl, settings?.wsUrl]
  );

  const loadRequests = useCallback(async () => {
    const [reqs, st] = await Promise.all([community.requests(), community.status()]);
    setLiveRequests(reqs ?? []);
    setSelfUid(st?.uid ?? '');
  }, []);

  useEffect(() => {
    const unsub = provider.subscribePresence?.(() => void refreshFriends());
    void loadRequests();
    const iv = setInterval(() => void loadRequests(), 10_000);
    return () => { unsub?.(); clearInterval(iv); };
  }, [provider, loadRequests, refreshFriends]);

  const refresh = async (fn: () => Promise<unknown>, okMsg?: string) => {
    try {
      await fn();
      if (okMsg) toast('success', okMsg);
      await Promise.all([refreshFriends(), loadRequests()]);
    } catch (e: any) {
      toast('error', e?.message ?? 'Failed');
    }
  };

  const visible = useMemo(() => {
    if (tab === 'online') return (friends as Friend[]).filter((f) => f.status !== 'offline');
    return friends as Friend[];
  }, [friends, tab]);

  // Входящие заявки с сервера сообщества + локальные
  const incomingLive = liveRequests.filter((r) => r.toUid === selfUid && r.status === 'pending');
  const outgoingLive = liveRequests.filter((r) => r.fromUid === selfUid && r.status === 'pending');
  const localIncoming = (requests as FriendRequest[]).filter((r) => r.direction === 'in').length;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'players', label: lang === 'ru' ? 'Все игроки' : 'All players' },
    { id: 'all', label: t(lang, 'all') },
    { id: 'online', label: t(lang, 'online') },
    { id: 'requests', label: `${t(lang, 'requests')} (${incomingLive.length + localIncoming})` },
    { id: 'blocked', label: t(lang, 'blocked') }
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="font-display text-3xl skew-display">{t(lang, 'friends')}</div>
        <div className="flex gap-3 items-center flex-wrap">
          <div className="text-[11px] font-mono text-violet-300/80 mr-1">
            {lang === 'ru' ? 'Твой ID:' : 'Your ID:'} #{playerId ?? '…'}
          </div>
          <AddFriend />
        </div>
      </div>

      {/* Явный призыв: ссылка-приглашение расположена сразу под заголовком */}
      <button
        onClick={() => document.getElementById('invite-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
        className="mb-3 flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold text-white border border-violet-400/30 hover:bg-violet-500/20 transition-colors"
        style={{ background: 'var(--accent-grad)' }}>
        <svg viewBox="0 0 24 24" className="w-4 h-4"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        {lang === 'ru' ? 'Моя пригласительная ссылка' : 'My invite link'}
      </button>

      {/* Пригласительная ссылка — прямо во вкладке «Друзья» */}
      <InviteCard />

      {/* Вкладки */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-2 ${tab === tb.id ? 'text-white' : 'text-white/50 hover:text-white bg-white/5'}`}
            style={tab === tb.id ? { background: 'var(--accent-grad)' } : undefined}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Каталог всех реальных игроков */}
      {tab === 'players' && <PlayerDirectory />}

      {/* Мои друзья */}
      {(tab === 'all' || tab === 'online') && (
        visible.length === 0 ? (
          <div className="glass-card p-10 flex flex-col items-center gap-3 text-center max-w-4xl">
            <svg viewBox="0 0 120 80" className="w-32 opacity-70">
              <circle cx="42" cy="30" r="14" fill="#8B5CF6" opacity="0.8" />
              <circle cx="78" cy="30" r="14" fill="#A78BFA" opacity="0.55" />
              <path d="M20 70c2-12 11-18 22-18s20 6 22 18z" fill="#8B5CF6" opacity="0.8" />
              <path d="M56 70c2-12 11-18 22-18s20 6 22 18z" fill="#A78BFA" opacity="0.55" />
            </svg>
            <div className="text-white/60 text-sm">{t(lang, 'noFriends')}</div>
            <div className="text-white/35 text-[11px]">
              {lang === 'ru' ? 'Найди игроков во вкладке «Все игроки» или поделись своей ссылкой' : 'Find players in the "All players" tab or share your invite link'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-w-4xl">
            {visible.map((f, i) => (
              <motion.div key={f.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="glass-card hoverable p-4 flex items-center gap-3">
                <div className="relative">
                  <div className="w-11 h-11 rounded-full flex items-center justify-center font-display text-lg" style={{ background: f.avatarColor ?? '#8B5CF6' }}>
                    {f.nickname.slice(0, 1).toUpperCase()}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1c1038] ${statusDot(f.status)}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{f.nickname}</div>
                  <div className="text-[11px] text-white/45">{statusLabel(lang, f.status)}</div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => void refresh(() => provider.sendRequest(f.nickname))} title={t(lang, 'invite')}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-violet-500/30 transition-colors">✉</button>
                  <button onClick={() => void refresh(() => provider.setStatus(f.id, f.status === 'online' ? 'inGame' : 'online'))} title={t(lang, 'profile')}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-violet-500/30 transition-colors">◉</button>
                  <button onClick={() => void refresh(() => provider.remove(f.id), 'Removed')} title={t(lang, 'remove')}
                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-xs hover:bg-red-500/30 transition-colors">✕</button>
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}

      {/* Заявки */}
      {tab === 'requests' && (
        <div className="flex flex-col gap-2 max-w-2xl">
          {incomingLive.map((r) => (
            <div key={r.id} className="glass-card hoverable p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold" style={{ background: 'var(--accent-grad)' }}>
                {r.fromNickname.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{r.fromNickname} <span className="font-mono text-[10px] text-white/40">#{r.fromPlayerId}</span></div>
                <div className="text-[11px] text-white/40">{lang === 'ru' ? 'Входящая заявка' : 'Incoming request'}</div>
              </div>
              <button onClick={() => void refresh(() => community.resolveRequest(r.id, true), 'Accepted')}
                className="btn-accent rounded-lg px-3 py-1.5 text-xs font-bold">{lang === 'ru' ? 'Принять' : 'Accept'}</button>
              <button onClick={() => void refresh(() => community.resolveRequest(r.id, false))}
                className="rounded-lg px-3 py-1.5 text-xs font-bold bg-white/5 border border-white/10 text-white/60">{lang === 'ru' ? 'Отклонить' : 'Decline'}</button>
            </div>
          ))}
          {outgoingLive.map((r) => (
            <div key={r.id} className="glass-card p-3 flex items-center gap-3 opacity-70">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold bg-white/10">↗</div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{lang === 'ru' ? 'Исходящая заявка' : 'Outgoing request'}</div>
                <div className="text-[11px] text-white/40 font-mono">{r.toUid.slice(0, 8)}…</div>
              </div>
            </div>
          ))}
          {(requests as FriendRequest[]).map((r) => (
            <div key={r.id} className="glass-card hoverable p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold bg-violet-500/60">{r.nickname.slice(0, 1).toUpperCase()}</div>
              <div className="flex-1">
                <div className="text-sm font-semibold">{r.nickname}</div>
                <div className="text-[11px] text-white/40">{r.direction === 'in' ? (lang === 'ru' ? 'Входящая заявка' : 'Incoming request') : (lang === 'ru' ? 'Исходящая заявка' : 'Outgoing request')}</div>
              </div>
              {r.direction === 'in' && (
                <>
                  <button onClick={() => void refresh(() => provider.accept(r.id), 'Accepted')} className="btn-accent rounded-lg px-3 py-1.5 text-xs font-bold">{lang === 'ru' ? 'Принять' : 'Accept'}</button>
                  <button onClick={() => void refresh(() => provider.decline(r.id))} className="rounded-lg px-3 py-1.5 text-xs font-bold bg-white/5 border border-white/10 text-white/60">{lang === 'ru' ? 'Отклонить' : 'Decline'}</button>
                </>
              )}
              <button onClick={() => void refresh(() => provider.block(r.nickname))} className="rounded-lg px-3 py-1.5 text-xs font-bold bg-red-400/10 text-red-300 border border-red-400/20">{t(lang, 'blocked')}</button>
            </div>
          ))}
          {incomingLive.length === 0 && outgoingLive.length === 0 && (requests as FriendRequest[]).length === 0 && (
            <div className="glass-card p-8 text-center text-white/40 text-sm">—</div>
          )}
        </div>
      )}

      {/* Чёрный список */}
      {tab === 'blocked' && (
        <div className="flex flex-col gap-2 max-w-2xl">
          {blocked.length === 0 ? (
            <div className="glass-card p-8 text-center text-white/40 text-sm">—</div>
          ) : (
            blocked.map((b) => (
              <div key={b} className="glass-card p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold bg-white/10">{b.slice(0, 1).toUpperCase()}</div>
                <div className="flex-1 text-sm font-semibold">{b}</div>
                <button onClick={() => void refresh(() => provider.unblock(b), 'Unblocked')} className="rounded-lg px-3 py-1.5 text-xs font-bold bg-white/5 border border-white/10 text-white/60">
                  {lang === 'ru' ? 'Разблокировать' : 'Unblock'}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default Friends;
