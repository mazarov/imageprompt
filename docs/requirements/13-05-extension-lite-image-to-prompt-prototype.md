# Ai Image Describer — описание прототипа

> Лёгкая редакция Chrome-расширения image-to-prompt. Без auth, оплаты, истории и встроенной генерации. Тип расширения — **гибрид «минимальный»: popup + service worker + context menu** (без content script, без side panel).
> Дата: 13.05.2026.

## 1. Идея

Chrome-расширение из одной функции: пользователь даёт картинку — расширение возвращает готовый prompt для генерации похожего изображения в любом AI-генераторе. Без логина, без оплаты, без истории, без встроенной генерации.

## 2. Пользовательские сценарии (только два)

A. **В popup:** открыть расширение → перетащить файл / выбрать через "Choose file" → увидеть промпт.
B. **На любом сайте:** правый клик по картинке → "Get prompt for similar image" → popup открывается с уже загруженной картинкой и сразу запускает анализ.

## 3. Шаги реализации

1. Берём за основу структуру **EveryAlt** (`https://github.com/EveryAlt/everyalt-chrome`): MV3, vanilla JS, без бандлера. Удаляем всю логику OpenAI BYOK, options-страницу с API-ключом и log из 10 записей.
2. В `background.js` регистрируем один пункт контекстного меню (`contexts: ["image"]`). По клику: `fetch` картинки → resize до 1024px JPEG q=0.85 через `OffscreenCanvas` (модуль взять у EveryAlt) → положить base64 в `chrome.storage.session` под ключом `pending_image` → `chrome.action.openPopup()`.
3. Popup при загрузке: читает `pending_image` из session storage; если нет — показывает drop-zone + "Choose file". Если есть — сразу превью + автозапуск анализа.
4. Запрос на единственный бэкенд: `POST https://imageprompt.tools/api/extension/analyze`, тело `{ image_base64, style? }`. Бэкенд — новый Next.js route на лендинге (без auth), внутри: rate-limit по IP (15 запросов/сутки), вызов **Gemini 2.5 Flash vision** с системным промптом, производным от `pingan8787/image2prompt/src/prompts/generalPrompt`. Ответ `{ prompt: string }`.
5. UI результата: моноширинный `<pre>`, кнопка "Copy prompt", кнопка "Try another image" (сбрасывает state). Ошибки сети/лимита — inline-баннер с понятным текстом, не toast.
6. Иконки 16/48/128 — переиспользуем из существующего `extension/` (квадратная "P", indigo gradient).
7. Манифест: `permissions: ["contextMenus","storage","activeTab","scripting"]`, `host_permissions: ["<all_urls>","https://imageprompt.tools/*"]`. `action.default_popup = "popup.html"`.
8. Тексты UI на английском (см. раздел 5), все формулировки прогнать через ChatGPT с промптом `correct this text used in the app UI: [текст]` до релиза.
9. Размещение в репо: новый каталог `extension-lite/` рядом с существующим `extension/` (последний не трогаем до миграции). После приёмки прототипа — переименовать `extension/` → `extension-legacy/` и `extension-lite/` → `extension/`.

## 4. Контракт бэкенда

### `POST /api/extension/analyze`

- **Request:** `{ image_base64: string, style?: "photoreal" | "midjourney" | "sd" | "flux" | "nano" | "dalle", locale?: string }` (`image_base64` — data URL вида `data:image/jpeg;base64,...`; `style` опционально, default `"photoreal"`; `locale` — BCP-47 тег UI локали пользователя, опционально).
- **Response (ok):** `{ prompt: string }`.
- **Response (err):** `{ error: "rate_limited" | "invalid_image" | "upstream_failed", message: string }`.
- **Rate-limit:** 15 запросов с одного IP в 24 часа (authenticated — bucket `user:<id>`). Preflight без списания; reserve перед Gemini; confirm после успеха; release на 502/503. Burst: опционально `EXTENSION_BURST_LIMIT_ENABLED=true` — 10 POST/min/IP в middleware (per-pod, best-effort). Живое значение — `aiid_app_config.extension_rate_limit_per_day` (fallback в коде: 15).
- **CORS:** разрешить `chrome-extension://<MV3_ID>` через env `CHROME_EXTENSION_ID` (паттерн уже используется в текущем backend лендинга).
- **Provider:** Gemini 2.5 Flash (есть `GEMINI_API_KEY` в `landing/.env.local`). Системный промпт собирается в `landing/src/lib/extension-prompt-sections.ts` → `buildExtractPrompt(style)`: **всегда** полный 12-section photoreal extract prompt; для non-photoreal styles (`midjourney`, `sd`, `flux`, `nano`, `dalle`) к базе добавляется только internal **model-tuning** instruction — Gemini слегка подстраивает формулировки внутри тех же секций под целевую модель, структура вывода не меняется.

### `POST /api/extension/remix`

- **Request:** `{ sectionLabel?: string, sectionText?: string, originalPrompt?: string, changeRequest: string, style?: "photoreal" | "midjourney" | "sd" | "flux" | "nano" | "dalle", locale?: string }` (section mode: `sectionLabel` + `sectionText`; fallback mode: `originalPrompt`; `locale` — BCP-47 тег UI локали пользователя, опционально).
- **Response (ok):** `{ sectionText: string }` (section mode) или `{ prompt: string }` (fallback mode); optional `remaining`, `max`.
- **Response (err):** `{ error: "invalid_request" | "rate_limited" | "upstream_failed", message: string }`.

### Локализация prompt output

When `locale` is provided, generated descriptive prompt text follows that locale. For photoreal structured prompts, section headings remain in English for extension parser compatibility (`Scene:`, `Genre:`, `Lighting:`, etc.).

## 5. Тексты UI (English; перед релизом прогнать через ChatGPT)

| Ключ | Текст |
|------|-------|
| Extension name | `Ai Image Describer` |
| Extension description | `Get a ready-to-use AI prompt from any image. One click, no signup.` |
| Context menu item | `Get prompt for similar image` |
| Popup empty state title | `Drop an image or paste from clipboard` |
| Popup empty state hint | `JPG or PNG, up to 10 MB` |
| Choose file button | `Choose file` |
| Loading state | `Analyzing image...` |
| Result title | `Prompt` |
| Copy button | `Copy prompt` |
| Copied toast | `Copied to clipboard` |
| Try again button | `Try another image` |
| Error rate-limited | `Daily limit reached. Try again in 24 hours.` |
| Error generic | `Something went wrong. Please try another image.` |
| Style selector label | `Style preset` |
| Style options | `Photo-real`, `Midjourney`, `Stable Diffusion`, `Flux`, `Nano Banana`, `DALL·E` |

> Перед релизом: каждую строку прогнать через ChatGPT с промптом `correct this text used in the app UI: [текст]`. Платящие пользователи — нейтив-спикеры, артикли и предлоги важны.

## 6. Чего НЕТ в MVP (явно фиксируем)

- Авторизации (Google, Supabase, JWT) — нет.
- Оплаты, кредитов, биллинга — нет.
- Истории генераций — нет.
- Самой генерации картинок — нет (только текст промпта).
- Hover-кнопки на картинках сайтов — нет (только контекстное меню).
- Side panel — нет (только popup).
- Content script — нет.
- Многоязычного UI — нет (только английский в первом релизе).

## 7. Артефакты для дизайнера (Figma)

Минимум 3 экрана popup (336×500 CSS px):

- **Empty state:** drop-zone + "Choose file" + "Style preset".
- **Loading:** превью картинки + индикатор + текст `Analyzing image...`.
- **Result:** превью картинки сверху, prompt в `<pre>`, кнопки `Copy prompt` / `Try another image`.

Плюс:

- Иконка тулбара в 16/48/128 px (можно переиспользовать существующую "P" indigo-gradient).
- Скриншот контекстного меню с пунктом `Get prompt for similar image` — нужен для листинга Chrome Web Store.

## 8. Acceptance criteria

- Правый клик по любой картинке на любом HTTPS-сайте показывает пункт меню.
- Клик по пункту меню открывает popup с уже загруженной картинкой и автоматически запускает анализ.
- Drag-and-drop файла в popup работает.
- Промпт можно скопировать одним кликом.
- При исчерпании лимита показывается понятная ошибка, расширение не виснет.
- Размер собранного расширения < 200 КБ (без бандлера, vanilla JS).
- Permissions в манифесте — минимальные (см. п. 3.7).

## 9. OSS-репозитории, которые переиспользуем

- **[EveryAlt/everyalt-chrome](https://github.com/EveryAlt/everyalt-chrome)** — структура проекта (manifest + service-worker + popup + lib), CORS-fallback через `chrome.scripting.executeScript`, resize через `OffscreenCanvas` → JPEG 85%.
- **[pingan8787/image2prompt](https://github.com/pingan8787/image2prompt)** — шаблоны промптов под разные генераторы (general / Midjourney / SD / Flux), список платформ как пресет. Hover-кнопку и историю **НЕ берём**.
- **[corbindavenport/alt-text-creator](https://github.com/corbindavenport/alt-text-creator)** — паттерн context-menu + clipboard copy + `chrome.notifications` для ошибок.
- **[RookieZoe/chrome-extension-image2prompt](https://github.com/RookieZoe/chrome-extension-image2prompt)** — backlog (фаза 2): streaming SSE и Flux dual-encoder промпт.

## 10. Решения по открытым вопросам

- **Имя в Chrome Web Store и в `manifest.json` нового расширения:** `Ai Image Describer`. (Casing использован как задано; финальная проверка native-speaker'ом / ChatGPT на этапе релиза — см. п. 5.)
- **Каталог в репо:** `extension-lite/` параллельно существующему `extension/`. Старый код не трогаем — сборка лендинга (`landing/scripts/build-stv-web.mjs`, зеркало `landing/stv-web-sidepanel/`) продолжает работать как раньше. Миграция/переименование — отдельной задачей после приёмки прототипа.
- **Rate-limit storage:** отдельная таблица в существующем Supabase. Минимальная схема:

  ```sql
  create table public.extension_rate_limit (
    ip_hash text primary key,           -- sha256(ip + daily_salt), не храним сырой IP
    window_start timestamptz not null,  -- начало текущего 24h окна
    count integer not null default 0
  );
  create index extension_rate_limit_window_idx on public.extension_rate_limit (window_start);
  ```

  Эндпоинт `/api/extension/analyze` атомарно увеличивает `count` через `rpc` или upsert и проверяет лимит 30/24h. Сырые IP не сохраняем, только хеш с дневной солью.
