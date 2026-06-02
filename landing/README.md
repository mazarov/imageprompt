# imageprompt.tools — лендинг (Next.js)

Next.js 15, App Router, Tailwind CSS.

## Запуск

```bash
# Установить зависимости (уже сделано)
npm install

# Секреты: `.env.local` в корне репозитория `imageprompt/` (рядом с `landing/`) — подхватывается из `next.config.ts`.
# Либо по-прежнему `landing/.env.local`, если положить файл только в `landing/`.
# Из каталога `landing/`: cp <источник> ../.env.local
# Поддерживаются:
# SUPABASE_SUPABASE_PUBLIC_URL или NEXT_PUBLIC_SUPABASE_URL
# SUPABASE_SERVICE_ROLE_KEY

# Dev (перед первым открытием /embed/stv или модалки генерации — собрать панель STV)
npm run build:stv-web
npm run dev
# http://localhost:3001

# Build (`npm run build` = STV web + `next build --no-lint`). Два сценария выката:
#   npm run deploy:fast   — только сборка (без eslint из командной строки).
#   npm run deploy:prod   — lint + build (перед «строгим» продом).
npm run build
npm start
```

Перед коммитом или в CI дополнительно: **`npm run lint`** — либо сразу **`npm run deploy:prod`** (линт + сборка). Для быстрой проверки сборки без линта: **`npm run deploy:fast`**.

Если в dev после правок появляется **`Cannot find module './….js'`** (битый webpack-чанк), остановите сервер, выполните **`rm -rf .next`** в каталоге **`landing/`** и снова **`npm run dev`**.

## Сборка (`npm run build`)

- Запуск из каталога **`landing/`**.
- **`build:stv-web`** смотрит **`../extension/sidepanel`**, иначе **`./stv-web-sidepanel/`** (зеркало в git для Docker). После правок в **`extension/sidepanel/`**: **`npm run sync:stv-sidepanel`**.
- Скрипты: **`build:stv-web`** → `public/stv-panel/boot.mjs` + `styles.css`; **`build`** → STV + **`next build --no-lint`** (ESLint в билде отключён ради скорости — гоняйте **`npm run lint`** отдельно).

## Steal This Vibe (extension + API)

Новые endpoints:

- `POST /api/vibe/extract`
- `POST /api/vibe/expand`
- `POST /api/vibe/save`

Новые SQL-миграции:

- `138_vibes_table.sql`
- `139_landing_generations_vibe_id.sql`
- `140_landing_vibe_saves.sql`
- `142_landing_vibe_saves_auto_seo_tags.sql`

### CORS для extension и cross-origin embeds

API вызывается из origin `chrome-extension://<id>` и с **promptshot.ru** (`/foto-v-promt/` → `POST /api/extension/analyze`), поэтому в env обязательно:

```bash
CHROME_EXTENSION_ID=<id из chrome://extensions>
# promptshot.ru live widget (Dockhost: разделитель «;» если запятые не проходят):
CORS_ALLOWED_ORIGINS=https://promptshot.ru;https://www.promptshot.ru
# или явный CSV: chrome-extension://<id1>,chrome-extension://<id2>
```

`middleware.ts` matcher включает `/api/:path*` — без этого CORS-заголовки на API не выставляются.

**Smoke после деплоя:**

```bash
curl -sI -X OPTIONS 'https://imageprompt.tools/api/extension/analyze' \
  -H 'Origin: https://promptshot.ru' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' | grep -i access-control
# ожидается: Access-Control-Allow-Origin: https://promptshot.ru
```

Без allowlist браузер заблокирует cross-origin запросы из extension и с promptshot.ru.

### Try this look на карточках

Чтобы включить публичную кнопку генерации на карточках (`/p/[slug]`), добавь:

```bash
NEXT_PUBLIC_ENABLE_TRY_THIS_LOOK=true
```

Если флаг не задан, кнопка остаётся доступной только в debug-режиме.

### Быстрый smoke checklist

1. Пользователь залогинен -> `GET /api/me` возвращает `200`
2. Upload фото -> `POST /api/upload-generation-photo` возвращает `storagePath`
3. Extract -> `POST /api/vibe/extract` возвращает `{ vibeId, style }`
4. Expand -> `POST /api/vibe/expand` возвращает 1 prompt (`accent: scene`)
5. Generate -> 1x `POST /api/generate` возвращает id
6. Polling -> `GET /api/generations/[id]` до `completed`
7. Save -> `POST /api/vibe/save` возвращает `saveId` (+ `autoTagCount`), auto-теги сохраняются в `landing_vibe_saves.auto_seo_tags`, при отсутствии `card_id` выполняется автопубликация карточки

## Docker

Контекст сборки — **каталог `landing/`** (как у Dockhost). Исходники STV для бандла лежат в **`landing/stv-web-sidepanel/`**.

```bash
# из корня клона imageprompt/
docker build -f landing/Dockerfile -t imageprompt-landing landing/
docker run -p 3001:3001 -e NEXT_PUBLIC_SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... imageprompt-landing
```

Не собирать **`docker build -f landing/Dockerfile .`** из корня репо — в контекст попадёт не тот **`package.json`**.

## Локализация (52 языка для страницы AI Image Describer)

Контент для `/ai-image-describer` (H1=appName, meta title=shortDesc, How it works, prompt, 5 шагов, 7 FAQ) берётся из Chrome Web Store переводов в `../extension-lite/_locales/*/messages.json`.

- Скрипт синхронизации (базовые строки — из `en.json` + переопределения под продукт):
  ```bash
  cd landing && node scripts/ingest-extension-locales.mjs
  ```
- После запуска обнови массив `locales` в `src/i18n/routing.ts` (скрипт печатает готовый список).
- Для `ru`/`en` переводы сайта не затираются (оставлены curated). Новые 50 локалей получают полный английский фолбэк для остального UI + локализованный контент дескрайбера.
- После изменений в extension-lite локалях — прогоняй скрипт и коммить новые `src/messages/*.json`.
