import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api/api';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';

const News: React.FC = () => {
  const { settings } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getNews().then((n) => { setItems(n ?? []); setLoading(false); });
  }, [settings?.newsUrl]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="font-display text-3xl skew-display mb-5">{t(lang, 'news')}</div>
      {loading ? (
        <div className="text-white/40 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="glass-card p-8 text-center text-white/40">No news. Set a news URL in Settings.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 max-w-5xl">
          {items.map((n, i) => (
            <motion.article
              key={n.id ?? i}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="glass-card hoverable p-5 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-grad)' }}>{n.tag ?? 'News'}</span>
                <span className="text-[11px] text-white/40">{n.date}</span>
              </div>
              <h3 className="font-display text-xl skew-display">{n.title}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{n.text}</p>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
};

export default News;
