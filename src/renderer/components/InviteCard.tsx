import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { api } from '../api/api';
import { community, copyText, type CommunityInvite } from '../providers/communityProvider';

/**
 * Блок пригласительной ссылки во вкладке «Друзья».
 *  - генерирует/обновляет персональную ссылку rumblewersfad://invite/CODE
 *  - копирует её в буфер
 *  - принимает чужую ссылку или код (из буфера / deep link)
 */
const InviteCard: React.FC = () => {
  const { settings, toast, refreshFriends } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const [invite, setInvite] = useState<CommunityInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [redeemInput, setRedeemInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [manualName, setManualName] = useState('');
  const [reachable, setReachable] = useState(true);
  // Защита от двойного погашения: ссылка может прийти и событием, и через pendingInvite
  const handledCodes = useRef<Set<string>>(new Set());

  const generate = useCallback(async () => {
    setBusy(true);
    try {
      const inv = await community.createInvite();
      setInvite(inv);
      setReachable(true);
    } catch (e: any) {
      setReachable(false);
      toast('error', e?.message ?? 'Invite unavailable');
    } finally { setBusy(false); }
  }, [toast]);

  useEffect(() => { void generate(); }, [generate]);

  const doCopy = async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast('success', lang === 'ru' ? 'Ссылка скопирована' : 'Link copied');
    } else {
      toast('error', lang === 'ru' ? 'Не удалось скопировать' : 'Copy failed');
    }
  };

  const doRedeem = useCallback(async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    try {
      const r = await community.redeemInvite(value);
      if (!r.ok) throw new Error(r.error ?? 'failed');
      toast('success', lang === 'ru'
        ? `Вы теперь друзья с ${r.friend?.nickname ?? 'игроком'}`
        : `You are now friends with ${r.friend?.nickname ?? 'player'}`);
      setRedeemInput('');
      await refreshFriends();
    } catch (e: any) {
      toast('error', e?.message ?? 'Invalid invite');
    } finally { setBusy(false); }
  }, [lang, toast, refreshFriends]);

  /** Ручное добавление: сохраняем карточку друга локально, без сервера. */
  const doManualAdd = async () => {
    const name = manualName.trim().replace(/^#/, '');
    if (!name) return;
    try {
      const current = await api.getFriends();
      const exists = (current ?? []).some((f: any) =>
        String(f?.nickname ?? '').toLowerCase() === name.toLowerCase() || String(f?.id ?? '') === name
      );
      if (!exists) {
        await api.setFriends([
          ...(current ?? []),
          { id: name, nickname: name, status: 'offline', avatarColor: '#8B5CF6' }
        ]);
      }
      setManualName('');
      toast('success', lang === 'ru' ? `${name} добавлен в друзья` : `${name} added to friends`);
      await refreshFriends();
    } catch (e: any) {
      toast('error', e?.message ?? 'Failed');
    }
  };

  // Deep link: приложение открыли по чужой ссылке.
  // Один и тот же код может прийти и IPC-событием, и через pendingInvite —
  // обрабатываем только один раз, иначе заявка задвоится.
  const handleIncoming = useCallback((code: string) => {
    const key = code.trim();
    if (!key || handledCodes.current.has(key)) return;
    handledCodes.current.add(key);
    setRedeemInput(key);
    void doRedeem(key);
    void community.clearInvite();
  }, [doRedeem]);

  useEffect(() => {
    community.onInvite(handleIncoming);
    void community.pendingInvite().then((c) => { if (c) handleIncoming(c); });
  }, [handleIncoming]);

  return (
    <motion.div id="invite-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 mb-4 max-w-4xl border border-violet-400/25">
      <div className="flex items-center gap-2 mb-3">
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-violet-300">
          <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <div className="font-semibold text-sm">{lang === 'ru' ? 'Пригласительная ссылка' : 'Invite link'}</div>
        <div className="ml-auto text-[10px] font-mono text-white/35">
          {reachable ? (lang === 'ru' ? 'сеть подключена' : 'network online') : (lang === 'ru' ? 'сервер недоступен' : 'server offline')}
        </div>
      </div>

      {/* Моя ссылка */}
      <div className="text-[11px] text-white/45 mb-1.5">
        {lang === 'ru' ? 'Отправь другу эту ссылку — он сразу добавится в друзья' : 'Send this link to a friend — they will be added instantly'}
      </div>
      <div className="flex gap-2 items-center">
        <div className="flex-1 min-w-0 rounded-lg bg-black/25 border border-white/10 px-3 py-2 font-mono text-[11px] text-violet-200 truncate select-all">
          {invite?.deepLink ?? (busy ? '…' : '—')}
        </div>
        <button disabled={!invite || busy} onClick={() => void doCopy(invite!.deepLink)}
          className="btn-accent rounded-lg px-3.5 py-2 text-xs font-bold shrink-0 disabled:opacity-40">
          {copied ? '✓' : (lang === 'ru' ? 'Копировать' : 'Copy')}
        </button>
        <button disabled={busy} onClick={() => void generate()} title={lang === 'ru' ? 'Создать новую ссылку' : 'Regenerate'}
          className="rounded-lg px-3 py-2 text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 shrink-0">↻</button>
      </div>
      {invite?.code && (
        <div className="text-[10px] text-white/35 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            {lang === 'ru' ? 'Или просто код:' : 'Or just the code:'}{' '}
            <span className="font-mono text-violet-300/80 select-all">{invite.code}</span>
          </span>
          <button onClick={() => void doCopy(invite.webLink)} className="hover:text-white underline decoration-dotted">
            {lang === 'ru' ? 'скопировать веб-ссылку' : 'copy web link'}
          </button>
        </div>
      )}

      <div className="h-px bg-white/8 my-3.5" />

      {/* Ввести чужую ссылку */}
      <div className="text-[11px] text-white/45 mb-1.5">
        {lang === 'ru' ? 'Есть ссылка или код от другого игрока? Вставь сюда:' : 'Got a link or code from another player? Paste it here:'}
      </div>
      <div className="flex gap-2 items-center">
        <input
          value={redeemInput}
          onChange={(e) => setRedeemInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void doRedeem(redeemInput); }}
          placeholder="rumblewersfad://invite/… или CODE"
          className="flex-1 min-w-0 rounded-lg bg-black/25 border border-white/10 px-3 py-2 text-xs outline-none placeholder:text-white/25"
          style={{ fontFamily: 'var(--font-ui)' }}
        />
        <button disabled={!redeemInput.trim() || busy} onClick={() => void doRedeem(redeemInput)}
          className="rounded-lg px-3.5 py-2 text-xs font-bold bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-400/25 disabled:opacity-40 shrink-0">
          {lang === 'ru' ? 'Добавить' : 'Add friend'}
        </button>
      </div>

      {/* Ручное добавление: работает даже без сети */}
      <div className="h-px bg-white/8 my-3.5" />
      <div className="text-[11px] text-white/45 mb-1.5">
        {lang === 'ru' ? 'Или добавь вручную по нику / #ID (работает офлайн):' : 'Or add manually by nickname / #ID (works offline):'}
      </div>
      <div className="flex gap-2 items-center">
        <input
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void doManualAdd(); }}
          placeholder={lang === 'ru' ? 'Ник или #ID игрока…' : 'Player nickname or #ID…'}
          className="flex-1 min-w-0 rounded-lg bg-black/25 border border-white/10 px-3 py-2 text-xs outline-none placeholder:text-white/25"
          style={{ fontFamily: 'var(--font-ui)' }}
        />
        <button disabled={!manualName.trim() || busy} onClick={() => void doManualAdd()}
          className="rounded-lg px-3.5 py-2 text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40 shrink-0">
          {lang === 'ru' ? '+ В друзья' : '+ Add'}
        </button>
      </div>
    </motion.div>
  );
};

export default InviteCard;
