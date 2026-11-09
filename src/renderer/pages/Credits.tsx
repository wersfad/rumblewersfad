import React from 'react';
import { motion } from 'framer-motion';
import Logo from '../components/Logo';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';

const Credits: React.FC = () => {
  const { settings } = useAppStore();
  const lang = settings?.language ?? 'ru';

  return (
    <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-10 mt-10 flex flex-col items-center gap-6 max-w-xl text-center">
        <Logo size={46} />
        <div className="text-sm text-white/60 leading-relaxed">
          {t(lang, 'disclaimer')}
        </div>
        <div className="text-xs text-white/40">
          Electron · React · TypeScript · Vite · Tailwind CSS · Framer Motion · Zustand · electron-store
        </div>
        <div className="text-xs text-white/30">Rumblewersfad v1.0.0 · {new Date().getFullYear()}</div>
      </motion.div>
    </div>
  );
};

export default Credits;
