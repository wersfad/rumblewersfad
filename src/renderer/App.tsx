import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Toasts from './components/Toasts';
import WelcomeModal from './components/WelcomeModal';
import { useAppStore, View } from './store/useAppStore';
import { api } from './api/api';
import Home from './pages/Home';
import News from './pages/News';
import PlayerStats from './pages/PlayerStats';
import MyMatches from './pages/MyMatches';
import Friends from './pages/Friends';
import Settings from './pages/Settings';
import Credits from './pages/Credits';

const pages: Record<View, React.FC> = {
  home: Home,
  news: News,
  stats: PlayerStats,
  matches: MyMatches,
  friends: Friends,
  settings: Settings,
  credits: Credits
};

const App: React.FC = () => {
  const { view, loadInitial, settings, minimizing } = useAppStore();

  // Тема оформления применяется на <html> (data-theme), чтобы захватить и body
  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme ?? 'violet';
  }, [settings?.theme]);

  useEffect(() => {
    void loadInitial();
    // drag & drop папки на окно
    const onDragOver = (e: DragEvent) => e.preventDefault();
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0] as (File & { path?: string }) | undefined;
      const folder = f?.path;
      if (!folder) return;
      const v: any = await api.validateFolder(folder);
      if (v?.valid) {
        await api.setSettings({ gameFolder: folder, gameExecutable: v.executable });
        useAppStore.getState().toast('success', `Game folder set: ${folder}`);
        await useAppStore.getState().refreshFolderInfo();
      } else {
        useAppStore.getState().toast('warning', 'Dropped folder is not a Rumbleverse folder');
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const Page = pages[view];

  return (
    <div
      className="h-full flex flex-col font-ui"
      style={{
        transform: minimizing ? 'scale(0.93)' : 'scale(1)',
        opacity: minimizing ? 0 : 1,
        filter: minimizing ? 'blur(3px)' : 'none',
        transition: 'transform 0.26s cubic-bezier(0.4,0,0.6,1), opacity 0.26s ease, filter 0.26s ease'
      }}
    >
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <TopBar />
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className="flex-1 flex overflow-hidden"
            >
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <Toasts />
      <WelcomeModal />
    </div>
  );
};

export default App;
