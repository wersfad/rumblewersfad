import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppStore } from '../store/useAppStore';

const colors: Record<string, string> = {
  success: 'border-emerald-400/50',
  error: 'border-red-400/50',
  warning: 'border-amber-400/50',
  info: 'border-violet-400/50'
};

const Toasts: React.FC = () => {
  const { toasts, dismissToast } = useAppStore();
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className={`glass-card pointer-events-auto px-4 py-3 text-sm font-medium border-l-4 ${colors[t.type]} max-w-xs`}
            onClick={() => dismissToast(t.id)}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default Toasts;
