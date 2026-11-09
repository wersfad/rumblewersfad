import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api/api';
import { useAppStore } from '../store/useAppStore';
import { t } from '../i18n/i18n';
import { community, copyText, type CommunityStatus, type GameNetworkState } from '../providers/communityProvider';

const row = 'glass-card p-4 flex items-center justify-between gap-4';
const labelCls = 'text-sm font-semibold';
const hintCls = 'text-[11px] text-white/40 mt-0.5';

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${value ? '' : 'bg-white/10'}`}
    style={value ? { background: 'var(--accent-grad)' } : undefined}
  >
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${value ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);

const Settings: React.FC = () => {
  const { settings, patchSettings, refreshFolderInfo, toast, refreshMatches, refreshFriends, playerId } = useAppStore();
  const lang = settings?.language ?? 'ru';
  const [logs, setLogs] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [argsText, setArgsText] = useState((settings?.launchArgs ?? []).join(' '));
  const [net, setNet] = useState<CommunityStatus | null>(null);
  const [gameNet, setGameNetState] = useState<GameNetworkState | null>(null);
  const [build, setBuild] = useState<Awaited<ReturnType<typeof api.appBuildInfo>> | null>(null);

  useEffect(() => {
    void api.appBuildInfo().then(setBuild).catch(() => setBuild(null));
  }, []);

  const refreshGameNet = async () => {
    try { setGameNetState(await community.gameNetworkRefresh()); } catch { /* ignore */ }
  };

  useEffect(() => {
    const load = () => {
      void community.status().then(setNet).catch(() => setNet(null));
      void community.gameNetworkState().then(setGameNetState).catch(() => setGameNetState(null));
    };
    load();
    const iv = setInterval(load, 15_000);
    community.onGameNetworkUpdate((s) => setGameNetState(s));
    return () => clearInterval(iv);
  }, []);

  const applyNetwork = async (p: Record<string, unknown>) => {
    await patchSettings(p as any);
    try { await community.restartHost(); } catch { /* ignore */ }
    void community.status().then(setNet).catch(() => setNet(null));
  };

  const setGameNet = async (p: { gameNetworkEnabled?: boolean; gameLauncherToken?: string; gameBridgePort?: number }) => {
    await patchSettings(p as any);
    try { setGameNetState(await community.gameNetworkConfig(p)); } catch { /* ignore */ }
  };

  if (!settings) return null;

  const selectFolder = async () => {
    const r = await api.selectFolder();
    if (!r.canceled && r.validation) {
      const v: any = r.validation;
      toast(v.valid ? 'success' : 'warning', v.valid ? `OK: ${r.folder}` : `Missing: ${v.missing.slice(0, 3).join(', ')}`);
      await refreshFolderInfo();
    }
  };

  const saveArgs = () =>
    void patchSettings({ launchArgs: argsText.split(/\s+/).filter(Boolean) });

  const resetAll = async () => {
    await api.setMatches([]);
    await api.setFriends([]);
    await api.setRequests([]);
    await refreshMatches();
    await refreshFriends();
    toast('info', 'Data reset');
  };

  const loadLogs = async () => {
    setLogs(await api.getLogs());
    setShowLogs(true);
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="font-display text-3xl skew-display mb-5">{t(lang, 'settings')}</div>
      <div className="flex flex-col gap-3 max-w-3xl">

        {/* Версия сборки и доступное обновление */}
        <div className="glass-card p-4 flex items-center justify-between gap-4 flex-wrap border border-violet-400/20">
          <div>
            <div className={labelCls}>
              {lang === 'ru' ? 'Установленная сборка' : 'Installed build'}{' '}
              <span className="font-mono text-violet-300">v{build?.installed.version ?? '…'}</span>
            </div>
            <div className={hintCls}>
              {build?.installed.builtAt
                ? `${lang === 'ru' ? 'Собрано' : 'Built'}: ${new Date(build.installed.builtAt).toLocaleString()} · ${build.installed.sourceHash ?? '—'}`
                : (lang === 'ru' ? '-dev сборка (запуск из исходников)' : 'dev build (running from source)')}
            </div>
            {build?.latest && (
              <div className="text-[11px] mt-1">
                {build.latest.version === build.installed.version ? (
                  <span className="text-emerald-300">
                    ✓ {lang === 'ru' ? 'Установлена последняя версия' : 'You are on the latest build'}
                  </span>
                ) : (
                  <span className="text-amber-300">
                    ↑ {lang === 'ru' ? 'Доступна новая версия' : 'New build available'}: v{build.latest.version}
                    {build.latest.notes ? ` — ${build.latest.notes}` : ''}
                  </span>
                )}
              </div>
            )}
          </div>
          <button onClick={async () => {
            const r = await api.appOpenInstaller();
            toast(r.ok ? 'success' : 'error', r.ok
              ? (lang === 'ru' ? 'Установщик открыт — запусти его' : 'Installer opened — run it')
              : (r.error ?? 'Not found'));
          }} className="btn-accent rounded-lg px-4 py-2 text-xs font-bold shrink-0">
            {lang === 'ru' ? 'Открыть установщик' : 'Open installer'}
          </button>
        </div>

        <div className={row}>
          <div className="min-w-0">
            <div className={labelCls}>{t(lang, 'gameFolder')}</div>
            <div className={`${hintCls} truncate`}>{settings.gameFolder ?? '—'}</div>
          </div>
          <button onClick={() => void selectFolder()} className="btn-accent rounded-lg px-4 py-2 text-xs font-bold shrink-0">
            {t(lang, 'selectFolder')}
          </button>
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{lang === 'ru' ? 'Проверка папки' : 'Folder validation'}</div>
            <div className={hintCls}>
              {settings.gameExecutable ? `exe: ${settings.gameExecutable}` : 'exe: —'}
            </div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${settings.gameFolder ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30' : 'bg-amber-400/15 text-amber-300 border border-amber-400/30'}`}>
            {settings.gameFolder ? (settings.gameExecutable ? 'OK' : 'NO EXE') : 'NOT SET'}
          </span>
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{t(lang, 'launchArgs')}</div>
            <input
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              onBlur={saveArgs}
              placeholder="-windowed -novsync …"
              className="mt-1 w-72 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs outline-none"
            />
          </div>
          <div className={hintCls}>Safe Mode = -safe + эти аргументы</div>
        </div>

        <div className={row}>
          <div className={labelCls}>{t(lang, 'region')}</div>
          <select
            value={settings.region}
            onChange={(e) => void patchSettings({ region: e.target.value as any })}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm outline-none"
          >
            <option value="auto">Auto</option><option value="eu">EU</option><option value="na">NA</option><option value="asia">Asia</option>
          </select>
        </div>

        <div className={row}>
          <div className={labelCls}>{t(lang, 'language')}</div>
          <select
            value={settings.language}
            onChange={(e) => void patchSettings({ language: e.target.value as any })}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm outline-none"
          >
            <option value="ru">Русский</option><option value="en">English</option>
          </select>
        </div>

        <div className={row}>
          <div className={labelCls}>{t(lang, 'theme')}</div>
          <select
            value={settings.theme ?? 'violet'}
            onChange={(e) => void patchSettings({ theme: e.target.value as any })}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm outline-none"
          >
            <option value="violet">{t(lang, 'themeViolet')}</option>
            <option value="dark">{t(lang, 'themeDark')}</option>
          </select>
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{t(lang, 'playerId')}</div>
            <div className={hintCls}>{lang === 'ru' ? 'Три цифры, генерируются один раз при первом запуске' : 'Three digits, generated once on first launch'}</div>
          </div>
          <span className="font-mono text-sm text-violet-300 bg-violet-500/10 border border-violet-400/20 rounded-lg px-3 py-1.5 select-all">
            {playerId ?? '…'}
          </span>
        </div>

        <div className={row}>
          <div className={labelCls}>{t(lang, 'nickname')}</div>
          <input
            defaultValue={settings.profileName}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== settings.profileName) void patchSettings({ profileName: v });
            }}
            maxLength={24}
            className="w-56 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm outline-none"
          />
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{t(lang, 'autoStart')}</div>
          </div>
          <Toggle value={settings.autoStart} onChange={(v) => void patchSettings({ autoStart: v })} />
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{t(lang, 'closeToTray')}</div>
          </div>
          <Toggle value={settings.closeToTray} onChange={(v) => void patchSettings({ closeToTray: v })} />
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{t(lang, 'dataSource')}</div>
            <div className={hintCls}>{settings.dataSource === 'remote' ? settings.apiBaseUrl : 'electron-store (local JSON)'}</div>
          </div>
          <select
            value={settings.dataSource}
            onChange={(e) => void patchSettings({ dataSource: e.target.value as any })}
            className="rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-sm outline-none"
          >
            <option value="local">{t(lang, 'local')}</option>
            <option value="remote">{t(lang, 'remote')}</option>
          </select>
        </div>

        {settings.dataSource === 'remote' && (
          <div className={row}>
            <div>
              <div className={labelCls}>{t(lang, 'apiUrl')}</div>
            </div>
            <input
              defaultValue={settings.apiBaseUrl}
              onBlur={(e) => void patchSettings({ apiBaseUrl: e.target.value.trim() })}
              className="w-64 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs outline-none"
            />
          </div>
        )}

        <div className={row}>
          <div>
            <div className={labelCls}>{t(lang, 'repairUrl')}</div>
            <div className={hintCls}>HTTP(S) base URL для докачки файлов при Repair</div>
          </div>
          <input
            defaultValue={settings.repairSourceUrl}
            onBlur={(e) => void patchSettings({ repairSourceUrl: e.target.value.trim() })}
            placeholder="https://example.com/rv-files/"
            className="w-64 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs outline-none"
          />
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{t(lang, 'viewLogs')}</div>
            <div className={hintCls}>{lang === 'ru' ? 'Логи лаунчера и вывод игры' : 'Launcher and game output logs'}</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void loadLogs()} className="rounded-lg px-3 py-2 text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10">{t(lang, 'viewLogs')}</button>
            <button onClick={async () => { await api.copyLogs(); toast('success', 'Copied'); }} className="rounded-lg px-3 py-2 text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10">Copy</button>
            <button onClick={() => void api.openLogsFile()} className="rounded-lg px-3 py-2 text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10">Open file</button>
          </div>
        </div>

        {/* ---- Сообщество: каталог реальных игроков ---- */}
        <div className="font-display text-xl skew-display mt-5 mb-1">
          {lang === 'ru' ? 'Сообщество и поиск игроков' : 'Community & player search'}
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{lang === 'ru' ? 'Статус сети' : 'Network status'}</div>
            <div className={hintCls}>
              {net?.reachable
                ? (lang === 'ru' ? `Подключено · онлайн ${net.online}` : `Connected · ${net.online} online`)
                : (lang === 'ru' ? 'Нет связи с сервером игроков' : 'Player server unreachable')}
              {net?.url ? ` · ${net.url}` : ''}
            </div>
          </div>
          <span className={`text-xs font-bold px-3 py-1 rounded-full shrink-0 ${net?.reachable ? 'bg-emerald-400/15 text-emerald-300 border border-emerald-400/30' : 'bg-amber-400/15 text-amber-300 border border-amber-400/30'}`}>
            {net?.reachable ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{lang === 'ru' ? 'Показывать меня игрокам' : 'Show me to other players'}</div>
            <div className={hintCls}>{lang === 'ru' ? 'Ник, #ID и статус (в игре / онлайн)' : 'Nickname, #ID and status (in game / online)'}</div>
          </div>
          <Toggle value={settings.presenceVisible} onChange={(v) => void applyNetwork({ presenceVisible: v })} />
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{lang === 'ru' ? 'Встроенный сервер' : 'Built-in server'}</div>
            <div className={hintCls}>{lang === 'ru' ? 'Поднимать сервер каталога внутри лаунчера' : 'Host the player directory inside the launcher'}</div>
          </div>
          <Toggle value={settings.communityHost} onChange={(v) => void applyNetwork({ communityHost: v })} />
        </div>

        {settings.communityHost && (
          <div className={row}>
            <div>
              <div className={labelCls}>{lang === 'ru' ? 'Доступ по локальной сети' : 'Allow LAN players'}</div>
              <div className={hintCls}>
                {lang === 'ru' ? 'Друзья в том же Wi-Fi смогут подключиться' : 'Friends on the same Wi-Fi can connect'}
                {net?.lanIp ? ` · http://${net.lanIp}:${net.lanPort ?? settings.communityPort}` : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {net?.lanIp && (
                <button
                  onClick={async () => {
                    const ok = await copyText(`http://${net.lanIp}:${net.lanPort ?? settings.communityPort}`);
                    toast(ok ? 'success' : 'error', ok ? 'Copied' : 'Copy failed');
                  }}
                  className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold bg-white/5 border border-white/10 hover:bg-white/10"
                >{lang === 'ru' ? 'Копировать адрес' : 'Copy address'}</button>
              )}
              <Toggle value={settings.communityLan} onChange={(v) => void applyNetwork({ communityLan: v })} />
            </div>
          </div>
        )}

        <div className={row}>
          <div>
            <div className={labelCls}>{lang === 'ru' ? 'Общий URL сервера игроков' : 'Shared player server URL'}</div>
            <div className={hintCls}>{lang === 'ru' ? 'Оставь пустым для локального сервера. Все игроки должны указать один URL.' : 'Leave empty for the local server. All players must use the same URL.'}</div>
          </div>
          <input
            defaultValue={settings.communityUrl}
            onBlur={(e) => void applyNetwork({ communityUrl: e.target.value.trim() })}
            placeholder="http://192.168.1.5:8787"
            className="w-64 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs outline-none"
          />
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{lang === 'ru' ? 'Порт / ключ' : 'Port / token'}</div>
            <div className={hintCls}>{lang === 'ru' ? 'Ключ — общий пароль приватного сервера (необязательно)' : 'Token is a shared password for a private server (optional)'}</div>
          </div>
          <div className="flex gap-2">
            <input
              key={'port-' + settings.communityPort}
              defaultValue={String(settings.communityPort)}
              onBlur={(e) => { const n = parseInt(e.target.value, 10); if (n > 0 && n < 65536) void applyNetwork({ communityPort: n }); }}
              className="w-20 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs outline-none"
            />
            <input
              key={'tok-' + settings.communityToken}
              defaultValue={settings.communityToken}
              onBlur={(e) => void applyNetwork({ communityToken: e.target.value.trim() })}
              placeholder={lang === 'ru' ? 'ключ…' : 'token…'}
              type="password"
              className="w-36 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs outline-none"
            />
          </div>
        </div>

        <div className="glass-card p-3 text-[11px] text-white/45 leading-relaxed max-w-3xl">
          {lang === 'ru'
            ? 'Каталог показывает реальных игроков, у которых запущен этот лаунчер и включена видимость. Статус «в игре» появляется только когда процесс Rumbleverse действительно запущен. Чтобы видеть друзей, все должны быть подключены к одному серверу: либо к твоему по локальной сети, либо к общему VPS (npm run server).'
            : 'The directory lists real players running this launcher with visibility enabled. The "in game" status appears only when the Rumbleverse process is actually running. To see friends, everyone must connect to the same server: either yours over LAN, or a shared VPS (npm run server).'}
        </div>

        {/* ---- Реальные игроки из файлов игры ---- */}
        <div className="font-display text-xl skew-display mt-5 mb-1">
          {lang === 'ru' ? 'Игроки из самой игры' : 'Players from the game'}
        </div>

        <div className={row}>
          <div>
            <div className={labelCls}>{lang === 'ru' ? 'Источник игроков Rumbleverse' : 'Rumbleverse player source'}</div>
            <div className={hintCls}>
              {lang === 'ru'
                ? 'Аккаунт guest из бэкенда игры, ростеры из логов матчей, локальный мост rVclient'
                : 'Guest account from the game backend, match-log rosters, local rVclient bridge'}
              {gameNet?.identity?.cozmoId ? ` · cozmo ${gameNet.identity.cozmoId}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void refreshGameNet()}
              className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold bg-white/5 border border-white/10 hover:bg-white/10">
              {lang === 'ru' ? 'Обновить' : 'Refresh'}
            </button>
            <Toggle value={settings.gameNetworkEnabled} onChange={(v) => void setGameNet({ gameNetworkEnabled: v })} />
          </div>
        </div>

        {settings.gameNetworkEnabled && (
          <>
            <div className={row}>
              <div>
                <div className={labelCls}>{lang === 'ru' ? 'Токен лаунчера rVclient' : 'rVclient launcher token'}</div>
                <div className={hintCls}>
                  {lang === 'ru'
                    ? 'Необязательно. Нужен для живых серверов и числа игроков онлайн (wss://api.rvclient.com). Без токена доступны аккаунт и логи.'
                    : 'Optional. Unlocks live servers and online player counts (wss://api.rvclient.com). Without it, guest account and logs still work.'}
                </div>
              </div>
              <input
                key={'gtok-' + settings.gameLauncherToken}
                defaultValue={settings.gameLauncherToken}
                onBlur={(e) => void setGameNet({ gameLauncherToken: e.target.value.trim() })}
                type="password" placeholder="launcher token…"
                className="w-56 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs outline-none"
              />
            </div>
            <div className={row}>
              <div>
                <div className={labelCls}>{lang === 'ru' ? 'Порт локального моста' : 'Local bridge port'}</div>
                <div className={hintCls}>-RVBridgePort (по умолчанию 47818)</div>
              </div>
              <input
                key={'gport-' + settings.gameBridgePort}
                defaultValue={String(settings.gameBridgePort ?? 47818)}
                onBlur={(e) => { const n = parseInt(e.target.value, 10); if (n > 0 && n < 65536) void setGameNet({ gameBridgePort: n }); }}
                className="w-24 rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs outline-none"
              />
            </div>
            <div className="glass-card p-3 text-[11px] leading-relaxed max-w-3xl text-white/50">
              {gameNet ? (
                <>
                  {lang === 'ru' ? 'Статус:' : 'Status:'}{' '}
                  <span className={gameNet.identity.ok ? 'text-emerald-300' : 'text-amber-300'}>
                    {gameNet.identity.ok
                      ? (lang === 'ru' ? `аккаунт в игре ${gameNet.identity.username} (${gameNet.identity.cozmoId})` : `game account ${gameNet.identity.username} (${gameNet.identity.cozmoId})`)
                      : (gameNet.identity.error ?? (lang === 'ru' ? 'нет связи с бэкендом игры' : 'game backend unreachable'))}
                  </span>
                  {' · '}
                  {lang === 'ru' ? 'серверовый WS' : 'server WS'}: {gameNet.wsConnected ? 'ON' : 'OFF'}
                  {gameNet.totalPlayers != null ? ` · ${lang === 'ru' ? 'игроков в игре' : 'players in game'}: ${gameNet.totalPlayers}` : ''}
                  {gameNet.lastError ? ` · ${gameNet.lastError}` : ''}
                </>
              ) : (lang === 'ru' ? 'Загрузка статуса…' : 'Loading status…')}
            </div>
          </>
        )}

        <div className={row}>
          <div className="text-red-300 text-sm font-semibold">{t(lang, 'resetData')}</div>
          <button onClick={() => void resetAll()} className="rounded-lg px-4 py-2 text-xs font-bold bg-red-400/15 text-red-300 border border-red-400/30 hover:bg-red-400/25">
            {t(lang, 'resetData')}
          </button>
        </div>
      </div>

      {showLogs && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 mt-4 max-w-3xl">
          <div className="flex justify-between items-center mb-2">
            <div className="font-display text-lg skew-display">Logs</div>
            <button onClick={() => setShowLogs(false)} className="text-white/50 hover:text-white">✕</button>
          </div>
          <pre className="max-h-64 overflow-y-auto text-[11px] leading-relaxed text-white/70 bg-black/30 rounded-lg p-3 whitespace-pre-wrap">
            {logs || '(empty)'}
          </pre>
        </motion.div>
      )}
    </div>
  );
};

export default Settings;
