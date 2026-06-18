# Prompt Remix — требования

> Доработка существующей фичи: после получения промпта (из картинки) пользователь может одной фразой попросить изменить его — «сделай ночь», «убери людей», «добавь aspect ratio 16:9» — и получить переписанный промпт без повторной загрузки картинки.
> Бэкенд-эндпоинт `POST /api/extension/remix` **уже реализован** (`landing/src/app/api/extension/remix/route.ts`). UI в `extension-lite/` **реализован** в рамках этого документа.
> Дата: 18.06.2026.

## 1. Идея

Сейчас поток в `extension-lite` односторонний: картинка → промпт → «Copy» / «Try another image». Remix замыкает цикл редактирования: на экране результата пользователь пишет, что хочет поменять, жмёт «Remix» — и получает новый промпт, переписанный с сохранением исходного смысла, структуры и языка. Картинку повторно не загружаем и не отправляем — ремикс работает поверх **текста** уже полученного промпта.

Это «refine, remix, reuse» из маркетинга (`landing` — `Marketing.how.step5`), доведённое до рабочей функции в расширении.

## 2. Пользовательские сценарии

A. **Базовый ремикс.** Пользователь на экране Result → вводит change request в поле ниже промпта → жмёт «Remix» → видит переписанный промпт на месте прежнего.

B. **Итеративный ремикс.** Результат ремикса можно ремиксить снова (новый change request применяется к уже переписанному промпту). Поле ввода после успешного ремикса очищается.

C. **Смена стиля при ремиксе.** Активный style preset (photoreal / midjourney / sd / flux) учитывается при ремиксе так же, как при анализе.

D. **Лимит исчерпан.** Если суточный лимит (общий с analyze) выбран — показываем тот же rate-limit экран, что и для анализа (с ссылкой на тарифы), ремикс не запускается.

## 3. Контракт бэкенда (уже реализован — фиксируем, не меняем)

- **Метод и путь:** `POST /api/extension/remix`
- **Request:**
  ```json
  {
    "originalPrompt": "string, обязателен, ≤ 8000 символов",
    "changeRequest": "string, обязателен, ≤ 1000 символов",
    "style": "photoreal | midjourney | sd | flux (опционально, default photoreal)"
  }
  ```
- **Response (ok):**
  ```json
  { "prompt": "string", "remaining": 27, "count": 3, "max": 30 }
  ```
  (`remaining` / `count` / `max` приходят только когда сработал rate-limit-учёт.)
- **Response (err):**
  - `400` — `{ "error": "invalid_request", "message": "..." }` (пустой/слишком длинный `originalPrompt` или `changeRequest`, или невалидный JSON).
  - `429` — `{ "error": "rate_limited", "message": "...", "limit_count", "limit_max", "authenticated", "auth_required" }`.
  - `502 | 503 | 500` — `{ "error": "upstream_failed", "message": "Something went wrong. Please try again." }`.
- **Rate-limit:** общий с `/api/extension/analyze` — ремикс расходует тот же суточный лимит по IP-хешу/пользователю. Preflight без инкремента; одно списание только после успешного ответа Gemini.
- **Provider:** Gemini 2.5 Flash-Lite, `temperature: 0.4`, `maxOutputTokens: 8192`, `thinkingConfig.thinkingBudget: 0`. Инструкция (`buildInstruction`) нейтральная: переписать AI image prompt согласно `changeRequest`, сохранить те же section headings и детали, вернуть только финальный промпт. Для non-photoreal стилей подмешивается мягкий style hint; для `photoreal` отдельный hint не добавляется, чтобы снизить риск safety-block на длинных портретных промптах.
- **Аналитика:** `recordAnalyzeEvent(..., { endpoint: "remix" })` — события ремикса логируются отдельным эндпоинтом и видны в analytics-вьюхах.

## 4. Реализация в `extension-lite/` (фронт расширения)

### 4.1 Дизайн-концепция — «remix composer»

Ремикс встроен в экран Result как **composer-бар, закреплённый снизу** (паттерн чат-инпута Linear / Notion / ChatGPT), а не как ещё одна форма с заголовком и кнопкой. Принцип: промпт остаётся главным героем экрана, а ремикс — лёгкое «дописал изменение → отправил». Над composer — ряд **quick-chips** с типовыми правками: это одновременно onboarding (пользователь узнаёт, что промпт вообще можно менять) и ускорение (один тап вместо набора фразы).

Раскладка панели `#state-result` сверху вниз:

1. **Превью-фрейм** с overlay-кнопками `Copy` / `Another` — без изменений.
2. **Заголовок `Prompt`** — без изменений.
3. **Prompt-box** (flex, локальный скролл) — добавлены визуальные состояния `.is-remixing` и `.just-remixed`.
4. **Remix-блок** (`.remix-block`), прижат к низу панели:
   - ряд **quick-chips** (горизонтальный скролл, без переноса): `Make it night` · `Remove people` · `More detail` · `16:9`. Тап = вставка/дописывание текста в инпут (не отправляет сразу — даёт отредактировать).
   - **composer** (`.remix-composer`): скруглённый контейнер с `textarea#remix-input` (авто-рост 1→3 строки, `maxlength="1000"`) и круглой кнопкой отправки `button#btn-remix` (иконка-стрелка вверх) внутри справа.

```
┌───────────────────────────────┐
│  [ img preview ]   Copy  Another│
├───────────────────────────────┤
│  PROMPT                         │
│  ┌─────────────────────────┐    │
│  │ a cinematic portrait…   │    │  ← prompt-box (scroll)
│  └─────────────────────────┘    │
│  ‹ Make it night · Remove… ›    │  ← quick-chips (scroll)
│  ┌───────────────────────┬──┐   │
│  │ Describe a change…    │ ↑│   │  ← composer
│  └───────────────────────┴──┘   │
└───────────────────────────────┘
```

### 4.2 Визуальный стиль (строго на существующих токенах `popup.css`)

**Quick-chips** (`.remix-chip`):
- `height:24px; padding:0 10px; border-radius:999px; font:600 11px;`
- default: `background: rgb(255 255 255 / 0.04); border:1px solid var(--border-soft); color: var(--text-muted);`
- hover: `border-color: rgb(129 140 248 / 0.5); color: var(--text);`
- ряд (`.remix-chip-row`): `display:flex; gap:6px; overflow-x:auto; scrollbar-width:none;` + краевая fade-маска `mask-image: linear-gradient(90deg, transparent, #000 10px, #000 calc(100% - 10px), transparent);`

**Composer** (`.remix-composer`):
- `display:flex; align-items:flex-end; gap:8px; padding:6px 6px 6px 12px; border-radius:14px; background: rgb(24 24 27 / 0.85); border:1px solid var(--border-input); box-shadow: var(--ring-inset);`
- `:focus-within`: `border-color: rgb(129 140 248 / 0.55);` + мягкое свечение `box-shadow: var(--ring-inset), 0 0 0 3px rgb(129 140 248 / 0.12);`
- `textarea`: прозрачный, без border/outline, `font-size:12.5px; line-height:1.5; color: var(--text); resize:none;`; placeholder `color: var(--text-dim);`. Авто-рост 1 строка → max 3 (~54px), дальше внутренний скролл.
- кнопка `#btn-remix`: `width:30px; height:30px; border-radius:999px; background: var(--indigo);` белая SVG-стрелка 16px; hover `var(--indigo-hover)`. disabled (пусто): `background: rgb(63 63 70 / 0.6); opacity:0.5; cursor:default;`. Появление текста → плавный переход в indigo (`transition: background .15s ease`) — кнопка «загорается».

**Состояния prompt-box**:
- `.is-remixing`: `opacity:0.55;` + сверху тонкий бегущий shimmer (переиспользуем `@keyframes load-shuttle`, 2px полоса); composer disabled, кнопка → spinner.
- `.just-remixed`: единичная 600 ms анимация левого края `box-shadow: inset 3px 0 0 var(--accent-glow)` → fade-out. Сигнал «текст обновился» без резкого скачка панели.

### 4.3 Микроинтеракции / UX-флоу

- **Отправка:** `Enter` = remix, `Shift+Enter` = новая строка; кнопка-стрелка дублирует.
- **Disabled-логика:** пустой trimmed-инпут → кнопка disabled; первый символ «зажигает» кнопку.
- **Chip-тап:** дописывает фразу в конец инпута (через `, ` если уже есть текст), фокус остаётся в инпуте, курсор в конце. Не отправляет автоматически — пользователь может уточнить.
- **Во время ремикса:** prompt-box `.is-remixing`, composer + chips заблокированы, остальной UI (Copy/Another/таб-бар) активен; повторная отправка невозможна.
- **Успех:** новый промпт заменяет старый с `.just-remixed` вспышкой, инпут очищается, chips остаются, quota-бейдж обновляется из `remaining`, prompt-box скроллится вверх.
- **Ошибка:** inline `#error-banner` в result-панели (кроме 429 → rate-limit экран, как у анализа). Текст в инпуте при ошибке **не теряется** — можно повторить.

### 4.4 Логика (`popup.js`)

- Функция `submitRemix()`:
  - guard: `currentPrompt` непустой; `changeRequest.trim()` непустой и ≤ 1000.
  - отправляет `{ type: "START_LITE_REMIX", originalPrompt: currentPrompt, changeRequest, style: currentStyle, dataUrl: currentDataUrl }` в `background.js` — переиспользуем base URL, CORS, квоту.
  - до ответа: `setRemixing(true)` (классы/disabled из §4.2–4.3).
  - success: `showResult(currentDataUrl, newPrompt, currentStyle)` + `flashRemixed()`, очищаем инпут, `renderQuota` из `remaining`, `historyLoaded = false`.
  - `rate_limited` / 429: `showRateLimitError()`.
  - прочие ошибки: `showInlineError(t("remixError"))`, `setRemixing(false)`, инпут сохраняем.
- Auto-grow textarea: пересчёт `height` на `input` (cap 3 строки, 54px).
- **Undo не реализован** (принято: исключить).

### 4.5 Переиспользование существующих механизмов

- Rate-limit/quota: готовый `renderQuota` + сообщения `LITE_QUOTA_UPDATED`; ремикс уменьшает тот же счётчик.
- Ошибки: переиспользуем `errorConnection`, `errorTimeout`, `errorRateLimited`, `errorGeneric`; добавляем только ремикс-специфичные строки (см. §5).
- `prefers-reduced-motion`: shimmer и `.just-remixed` отключаются (как уже сделано для `.btn` / `load-shuttle`).

### 4.6 Service worker (`background.js`)

- Message-тип `START_LITE_REMIX`: принимает `{ originalPrompt, changeRequest, style, dataUrl }`, fetch на `/api/extension/remix`, возвращает `{ ok, prompt, remaining, max, historyEntryId }` или `{ ok:false, error, statusCode }`.
- Base URL, заголовки, auth-токен, обработка 429 и broadcast `LITE_QUOTA_UPDATED` — как у анализа.
- **History:** на успехе `background.js` строит запись через `createLiteHistoryEntry(dataUrl, style, prompt)` и вызывает `relayOrQueueLiteHistoryEntry` + `appendLiteHistoryStore` — точно как `completeLiteAnalysisJob`. Popup передаёт `dataUrl` в сообщении.
- Ремикс **не** создаёт долгоиграющий job: операция синхронная в рамках открытого popup; `ANALYSIS_JOB_KEY` не задействуем.

## 5. Тексты UI (English; перед релизом прогнать через ChatGPT)

Добавить ключи в `extension-lite/_locales/en/messages.json` (и перевести во все остальные `_locales/*`, как для прочих строк расширения):

| Ключ | Текст |
|------|-------|
| `remixPlaceholder` | `Describe a change…` |
| `remixButtonAria` | `Remix prompt` |
| `remixChipsAria` | `Quick edits` |
| `remixLoading` | `Remixing…` |
| `remixError` | `Couldn't remix the prompt. Please try again.` |
| `remixChipNight` | `Make it night` |
| `remixChipNoPeople` | `Remove people` |
| `remixChipDetail` | `More detail` |
| `remixChipWide` | `16:9` |

> Composer-плейсхолдер намеренно короткий — подсказки по типам правок несёт ряд quick-chips, а не длинный placeholder. Перед релизом каждую строку прогнать через ChatGPT с промптом `correct this text used in the app UI: [текст]`. Переводы — тем же пайплайном i18n, что и остальные ключи `_locales` (chip `16:9` не переводится).

## 6. Чего НЕТ в этой итерации (явно фиксируем)

- Повторной отправки картинки при ремиксе — нет (ремикс только по тексту промпта).
- Многошаговой истории версий / diff между ними — нет (полноценный version stack — кандидат на фазу 2).
- Undo к прежнему промпту — нет (принято, исключено).
- Кастомных/редактируемых пользователем quick-chips — нет (4 фиксированных пресета; кастомизация — фаза 2).
- Стриминга ответа (SSE) — нет.

## 7. Acceptance criteria

- На экране Result под промптом есть ряд quick-chips и composer (поле + кнопка-стрелка); кнопка disabled при пустом поле и «загорается» при вводе.
- Тап по chip дописывает фразу в инпут (не отправляет), фокус и курсор — в конце инпута.
- Корректный change request → промпт в `#prompt-box` заменяется переписанным с краткой `.just-remixed` подсветкой, инпут очищается, превью картинки не меняется.
- Во время запроса prompt-box в `.is-remixing` (shimmer), composer заблокирован, повторная отправка невозможна; остальной UI активен.
- Ремикс расходует общий суточный лимит; quota-бейдж обновляется; при 429 — rate-limit экран с ссылкой на тарифы.
- Язык переписанного промпта совпадает с языком исходного (RU→RU, EN→EN).
- Ошибка бэкенда (5xx/сеть/таймаут) показывается inline в result-панели, расширение не виснет, текст в инпуте сохраняется.
- `Enter` запускает ремикс, `Shift+Enter` переносит строку.
- Каждый успешный ремикс появляется новой записью в History (вкладка History).
- Результат ремикса сохраняется в `POPUP_STATE_KEY` и восстанавливается при повторном открытии popup.
- Новые i18n-ключи присутствуют в EN; остальные локали используют EN-фолбэк автоматически.
- `prefers-reduced-motion` отключает shimmer, spinner и `.just-remixed`.

## 8. Открытые вопросы

1. **Лимит длины ввода:** UI-`maxlength` = 1000 (совпадает с `MAX_CHANGE_LEN` на бэке). Подтвердить, что 1000 достаточно для типичных правок.
2. **Состав quick-chips:** утвердить 4 дефолтных пресета (`Make it night`, `Remove people`, `More detail`, `16:9`) или заменить под реальные сценарии пользователей.
