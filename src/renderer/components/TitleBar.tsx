import React, { useEffect, useState } from 'react';
import { api } from '../api/api';
import { useAppStore } from '../store/useAppStore';

const TitleBar: React.FC = () => {
  const [maximized, setMaximized] = useState(false);
  const setMinimizing = useAppStore((s) => s.setMinimizing);

  useEffect(() => {
    api.onMaximized?.(() => setMaximized(true));
    api.onUnmaximized?.(() => setMaximized(false));
    api.onRestored?.(() => setMaximized(false));
  }, []);

  // Плавная анимация перед сворачиванием: окно «растворяется», затем minimize
  const handleMinimize = () => {
    setMinimizing(true);
    setTimeout(() => {
      api.minimize();
      setMinimizing(false);
    }, 260);
  };

  const btn =
    'no-drag w-11 h-8 flex items-center justify-center text-white/70 hover:bg-white/10 hover:text-white transition-colors';

  return (
    <div className="drag-region h-11 flex items-center justify-end pl-4 pr-1 select-none shrink-0 border-b border-white/5">
      <div className="flex items-center h-full">
        <button className={btn} title="Minimize" onClick={handleMinimize}>
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1.6" rx="0.8" fill="currentColor" /></svg>
        </button>
        <button className={btn} title="Maximize / Restore" onClick={() => api.maximize()}>
          {maximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="3" y="1" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="1" y="3" width="8" height="8" rx="1" fill="rgba(20,12,40,0.85)" stroke="currentColor" strokeWidth="1.4" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
          )}
        </button>
        <button className={`${btn} hover:!bg-red-500/80 hover:!text-white rounded-tr-theme`} title="Close" onClick={() => api.close()}>
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2 L10 10 M10 2 L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
