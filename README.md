# Rumblewersfad

Неофициальный фанатский лаунчер и трекер статистики для **Rumbleverse** (Windows).
Не связан с Iron Galaxy и Epic Games.

## Стек

- **Electron 33** (ESM main + preload, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` для ESM-preload)
- **React 18 + TypeScript + Vite** (renderer)
- **Tailwind CSS** + **Framer Motion**
- **Zustand** (state), **electron-store** (локальное хранилище)
- **electron-builder** → NSIS `.exe`

## Структура

```
Rumblewersfad/
├── index.html                 # точка входа Vite
├── package.json / vite.config.ts / tailwind.config.js / postcss.config.js
├── tsconfig.json              # renderer
├── tsconfig.node.json         # main + preload → dist/
├── electron-builder.yml
├── assets/
│   ├── icon.ico / icon.png    # иконка приложения (scripts/make-icon.mjs)
│   └── fonts/                 # подключаемые шрифты (см. assets/fonts/README.md)
├── config/
│   ├── game-executables.json  # список exe и ключевых папок для валидации
│   └── file-manifest.json     # манифест для Repair Files (path + опц. sha256)
├── public/
│   ├── icon.svg               # SVG-логотип
│   └── news.json              # дефолтная лента новостей
├── scripts/make-icon.mjs      # PNG → ICO
├── server/
│   └── index.mjs              # отдельный сервер сообщества (VPS / LAN)
└── src/
    ├── main/                  # Electron main process
    │   ├── main.ts            # окно, single-instance, deep link, запуск сообщества
    │   ├── window.ts          # создание frameless-окна (acrylic), контролы
    │   ├── ipc.ts             # все IPC-каналы с валидацией путей
    │   ├── game.ts            # валидация папки, spawn игры, repair
    │   ├── store.ts           # electron-store, настройки, clientUid
    │   ├── presenceServer.ts  # HTTP/SSE/WS сервер каталога игроков (0 зависимостей)
    │   ├── community.ts       # heartbeat, прокси IPC, пригласительные ссылки
    │   ├── paths.ts           # safeJoin, folderSize, formatBytes
    │   ├── logs.ts            # файловые логи
    │   └── tray.ts
    ├── preload/
    │   ├── preload.ts         # contextBridge API
    │   └── preload.d.ts       # типы window.api (+ CommunityPlayer/Invite/Status)
    └── renderer/
        ├── main.tsx / App.tsx / index.css / theme.css   # тема: все CSS-переменные
        ├── api/api.ts         # типизированная обёртка над window.api
        ├── store/useAppStore.ts
        ├── i18n/i18n.ts       # RU / EN
        ├── providers/         # friendsProvider, communityProvider (реальный каталог), matchesProvider
        ├── components/        # PlayerDirectory, InviteCard, AddFriend, TitleBar, Sidebar…
        └── pages/             # Home, News, PlayerStats, MyMatches, Friends, Settings, Credits
```

## Установка и запуск

```powershell
npm install
npm run dev        # vite + tsc watch + electron (http://localhost:5173)
```

## Поиск реальных игроков и пригласительные ссылки

Вкладка **Друзья** теперь содержит:

- **«Все игроки»** — каталог всех реальных игроков сети: ник, короткий `#ID`,
  статус (`онлайн` / `в игре` / `был N мин назад`), живой поиск по нику или ID,
  фильтры и кнопку отправки заявки в друзья.
- **Поиск в шапке** (`AddFriend`) — ищет по тому же реальному каталогу,
  демо-заглушки (`SEED_USERS`) удалены.
- **Пригласительная ссылка** — персональная `rumblewersfad://invite/CODE`,
  кнопка копирования, веб-ссылка `http://host/i/CODE` и поле для ввода чужого
  кода. Погашение ссылки сразу добавляет обоих игроков в друзья.
- **Заявки** — входящие/исходящие с сервера сообщества + локальные.

### Откуда берутся «реальные» игроки

Игра (`RumbleverseClient.exe`, community-ревайвл) общается с
`wss://api.rvclient.com` и `https://game.rvclient.com`. Список игроков там
**не публичный**: `/panel/api/me` отдаёт `401 Not logged in`, ростер доступен
только авторизованному клиенту/админ-панели (Discord OAuth). Прямого
неавторизованного способа перечислить всех игроков сервера нет — поэтому
«тянуть» их из чужого бэкенда нельзя ни технически, ни корректно.

Реализована своя **opt-in сеть присутствия**: каждый запущенный лаунчер раз в
12 с отправляет heartbeat (стабильный `clientUid`, ник, `#ID`, регион) на сервер
сообщества. Статус `в игре` выставляется **только когда процесс игры реально
запущен** (`game:status`), так что в каталоге видно именно тех, кто играет.
Видимость можно выключить в Настройках.

### Как подключить нескольких игроков

**Вариант A — один компьютер / локальная сеть (проще всего)**

1. В Настройках → «Сообщество» включите **«Доступ по локальной сети»**.
2. Нажмите «Копировать адрес» (`http://192.168.x.x:8787`) и раздайте друзьям.
3. Друзья вписывают этот URL в **«Общий URL сервера игроков»**.
4. Все появятся во вкладке «Все игроки». Порт 8787 должен быть открыт в
   фаерволе Windows.

**Вариант B — общий сервер для интернета (VPS)**

```powershell
npm run build:electron     # компилирует src/main → dist/main
npm run server             # поднимает 0.0.0.0:8787
```

Переменные окружения: `PORT`, `HOST`, `RV_COMMUNITY_TOKEN` (общий ключ для
приватного сервера), `RV_DATA_FILE`. Все игроки указывают `http://<vps>:8787`
в Настройках. Каталог сохраняется в JSON и переживает перезапуск.

> `RV_COMMUNITY_TOKEN` также нужно вписать в поле «Ключ» в Настройках —
> main-процесс проксирует запросы и подставляет заголовок, токен не попадает
> в рендерер.

### API сервера присутствия

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/health` | проверка живости, счётчик онлайн |
| `POST` | `/presence` | heartbeat игрока |
| `GET` | `/directory?q=` | все игроки / поиск |
| `GET` | `/users/search?q=` | алиас для совместимости |
| `POST` | `/invites` | создать код приглашения |
| `GET` | `/invites/:code` | проверить код |
| `POST` | `/invites/:code/redeem` | принять приглашение |
| `GET/POST/DELETE` | `/friends[/:uid]` | список / добавить / удалить |
| `GET/POST` | `/friends/requests` | заявки |
| `POST` | `/friends/requests/:id/(accept\|decline)` | ответ на заявку |
| `GET` | `/events` | SSE-поток обновлений |
| `WS` | `/presence` | WebSocket-обновления (совместимость с README-контрактом) |

`uid` передаётся в query `?uid=` или заголовке `X-Player-Uid`. Есть
CORS, ограничение размера тела, rate-limit и санитизация строк.

## Сборка установщика

```powershell
npm run build      # dist + release/Rumblewersfad-Setup-1.0.0.exe (NSIS)
npm run build:dir  # без установщика, просто папка
```

> Если сборка падает на `winCodeSign` с ошибкой «Cannot create symbolic link» —
> на Windows без Developer Mode 7za не может развернуть symlink-и. Запустите
> сборку с `CSC_IDENTITY_AUTO_DISCOVERY=false` (или включите Developer Mode).

## Как заменить шрифт

Положите `.woff2`/`.ttf` в `assets/fonts/` и обновите `@font-face` в
`src/renderer/theme.css` (переменные `--font-display` / `--font-ui`).
См. `assets/fonts/README.md`. По умолчанию: **Titan One** (display, в духе логотипа Rumbleverse) и **Chakra Petch** 500/600/700 (весь UI).

## Как подключить свой API

В **Settings → Data source → Custom API** укажите базовый URL. Ожидаемые эндпоинты:

- Матчи: `GET/POST /matches`, `DELETE /matches/:id`
- Друзья: `GET/POST/DELETE /friends[/:id]`, `/friends/requests`, `/friends/blocked`,
  `POST /friends/requests/:id/(accept|decline)`, `PUT /friends/:id/status`
- Статистика: `GET /players/:nickname`
- Присутствие: WebSocket `{wsUrl}/presence` (сообщения `Friend`)
- Новости: JSON-массив в Settings → news URL (или дефолтный `public/news.json`)

По умолчанию всё хранится локально (electron-store) — `LocalProvider`.

## Безопасность

Все файловые операции и запуск процессов — только через preload + `ipcMain`.
Пути валидируются (`safeJoin` — запрет выхода за пределы выбранной папки),
`contextIsolation: true`, `nodeIntegration: false`, CSP в `index.html`.
