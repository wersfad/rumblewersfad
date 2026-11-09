import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';
import Logo from './Logo';

/** Первый запуск: пользователь сам придумывает ник. */
const WelcomeModal: React.FC = () => {
  const { settings, patchSettings } = useAppStore();
  const [nick, setNick] = useState('');
  const lang = settings?.language ?? 'ru';
  const open = !!settings && !settings.onboarded;

  const save = () => {
    const v = nick.trim() || 'Player';
    void patchSettings({ profileName: v.slice(0, 24), onboarded: true });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-md flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.85, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, y: 30 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="glass-card p-8 w-[400px] flex flex-col items-center gap-4 text-center"
            style={{ background: 'rgba(24,14,48,0.95)' }}
          >
            <Logo size={64} />
            <div className="font-display text-3xl skew-display">{t(lang, 'welcomeTitle')}</div>
            <div className="text-sm text-white/60 leading-relaxed">{t(lang, 'welcomeText')}</div>
            <input
              autoFocus
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder={t(lang, 'welcomePlaceholder')}
              maxLength={24}
              className="w-full glass-card !rounded-xl px-4 py-3 text-center text-lg outline-none border-white/20 placeholder:text-white/30 text-white"
              style={{ fontFamily: 'var(--font-ui)', textTransform: 'none', fontStyle: 'normal', fontWeight: 700 }}
            />
            <button onClick={save} className="btn-accent rounded-xl px-10 py-3 font-display text-lg skew-display w-full">
              {t(lang, 'save')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeModal;
