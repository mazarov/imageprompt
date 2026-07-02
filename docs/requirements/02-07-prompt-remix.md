# Prompt Remix — требования

> Доработка существующей фичи: после получения промпта (из картинки) пользователь описывает изменение в свободной форме («убери фон, сделай улыбку») и получает обновлённый промпт — модель сама определяет какие секции менять, расширение локально вклеивает только изменённые блоки без повторной загрузки картинки.
> Бэкенд-эндпоинт `POST /api/extension/remix` реализован в `landing/src/app/api/extension/remix/route.ts`. UI в `extension-lite/` — auto remix composer (без выбора секции).
> Дата: 18.06.2026 (обновлено 02.07.2026 — auto mode / section_diff; 02.07.2026 — two-step classifier + scoped rewriter).

## 1. Идея

Поток в `extension-lite`: картинка → структурированный промпт с секциями → пользователь вводит общий change request → «Remix». Backend в режиме `mode: "auto"` делает **два** Gemini-вызова:

1. **Classifier** — получает только `changeRequest` и список доступных labels (из локального парсинга `originalPrompt`); возвращает `{ labels: [...] }`.
2. **Scoped rewriter** — получает только тексты выбранных секций; возвращает `{ changes: [{ label, text }] }`.

Полный prompt **не** отправляется в Gemini целиком (только server-side slicing). Расширение локально подставляет `changes` через `applyPromptSectionChanges`. Картинку повторно не загружаем.

Итеративный ремикс: каждый следующий remix применяется к уже собранному полному промпту.

## 2. Пользовательские сценарии

A. **Auto remix.** Result → «убери фон и сделай улыбку» → Remix → модель меняет релевантные секции (например Scene, Mood, Composition), остальные без изменений.

B. **Итеративный ремикс.** После успеха инпут очищается; можно снова описать правку и remix.

C. **Промпт без заголовков.** Parser возвращает одну fallback-секцию `Prompt`; auto remix заменяет весь текст первой правкой.

D. **Лимит исчерпан.** 429 → тот же rate-limit экран, что у analyze.

E. **Пустой ответ модели.** Если модель вернула `{changes:[]}` или ни одна правка не применилась — показываем `remixError`.

## 3. Контракт бэкенда

- **Метод и путь:** `POST /api/extension/remix`

### 3.1 Auto mode (основной, extension-lite ≥ auto remix)

**Request:**
```json
{
  "originalPrompt": "string, ≤ 8000",
  "changeRequest": "remove background and add a smile",
  "style": "photoreal",
  "mode": "auto",
  "locale": "en"
}
```

- `originalPrompt` — обязателен, ≤ 8000 символов.
- `changeRequest` — обязателен, ≤ 1000 символов.
- `mode: "auto"` — включает structured JSON-ответ.
- `sectionLabel` / `sectionText` **не** отправляются.

**Response (ok):**
```json
{
  "changes": [
    { "label": "Scene", "text": "Scene:\n…" },
    { "label": "Mood", "text": "Mood:\n…" }
  ],
  "remaining": 27,
  "count": 3,
  "max": 30
}
```

Gemini **не** получает весь prompt. Сервер:

1. Парсит `originalPrompt` локально (`parseAvailablePromptSections`) — headings из `SECTION_SPEC_ORDER` + `CRITICAL RULES`.
2. **Classifier call** (`temperature: 0`, `maxOutputTokens: 256`): input = `changeRequest` + available labels; output schema `{ labels: string[] }`.
   - Пустой/невалидный classifier → fallback labels: `Visual Hook`, `Mood`, `Color`, `Composition`, `Avoid` (если есть в промпте).
   - При любых выбранных labels всегда добавляется `Avoid`, если секция есть в промпте.
3. **Rewriter call** (`temperature: 0.4`, `maxOutputTokens: 4096`): input = только тексты выбранных секций; output schema `{ changes: [{ label, text }] }`.

Rate-limit: один `reserve` перед обоими вызовами, один `confirm` после успешного rewriter; `release` при ошибке classifier или rewriter.

Логи: `remix.classifier_request` / `remix.classifier_response`, затем `remix.gemini_request` / `remix.gemini_response` (step=`rewriter`).

### 3.2 Section mode (legacy, сохранён для старых клиентов)

**Request:**
```json
{
  "sectionLabel": "Scene",
  "sectionText": "Scene:\nA person stands…",
  "changeRequest": "make it night",
  "style": "photoreal"
}
```

**Response (ok):** `{ "sectionText": "Scene:\n…", …quota }` — одна переписанная секция. `maxOutputTokens: 2048`.

### 3.3 Legacy whole-prompt mode (fallback для старых клиентов)

**Request:**
```json
{
  "originalPrompt": "string, ≤ 8000",
  "changeRequest": "string, ≤ 1000",
  "style": "photoreal"
}
```

**Response (ok):** `{ "prompt": "string", …quota }` — полный переписанный промпт.

### 3.4 Общее

- **429 / 5xx** — без изменений.
- **Rate-limit:** общий с analyze; reserve → classifier + rewriter → confirm/release (один remix на пользователя).
- **Provider:** Gemini 2.5 Flash-Lite, `temperature: 0.4`, `thinkingBudget: 0`.

## 4. Реализация в `extension-lite/`

### 4.1 Composer (без section chips)

```
┌───────────────────────────────┐
│  [ img preview ]   Copy  Another│
├───────────────────────────────┤
│  PROMPT                         │
│  ┌─────────────────────────┐    │
│  │ Scene: …                │    │
│  │ Genre: …                │    │
│  └─────────────────────────┘    │
│  EDIT PROMPT                    │
│  ┌───────────────────────┬──┐   │
│  │ Describe your change… │ ↑│   │
│  └───────────────────────┴──┘   │
└───────────────────────────────┘
```

### 4.2 Parser (`lib/prompt-sections.js`)

- `parsePromptSections(prompt)` — секции с `key`, `label`, `heading`, `body`, `text`, `start`, `end`.
- `replacePromptSection(prompt, sectionKey, updatedSectionText)` — локальная замена одной секции.
- `normalizeSectionText(label, text, heading)` — гарантирует heading в ответе Gemini.
- `applyPromptSectionChanges(prompt, changes)` — применяет массив `{label, text}` от auto remix.

### 4.3 Popup (`popup.js`)

- `submitRemix()` отправляет `{ originalPrompt, changeRequest, style, dataUrl }` без section-полей.
- Кнопка Remix disabled без текста в инпуте.

### 4.4 Service worker (`background.js`)

- Async remix job: `startLiteRemixJob` → `completeLiteRemixJob`.
- API body: `{ originalPrompt, changeRequest, style, locale, mode: "auto" }`.
- После ответа: `applyPromptSectionChanges(originalPrompt, changes)` → полный prompt в job/history/popup.
- Если `changes` пуст или промпт не изменился → error job.

## 5. Тексты UI (English)

| Ключ | Текст |
|------|-------|
| `remixSectionLabel` | `Edit prompt` |
| `remixPlaceholder` | `Describe your change…` |
| `remixButtonAria` | `Remix prompt` |
| `remixLoading` | `Remixing…` |
| `remixError` | `Couldn't remix the prompt. Please try again.` |

Удалены: `remixChipsAria`, `remixSelectSectionError`.

## 6. Чего НЕТ в этой итерации

- Выбор секции chip-ами в UI.
- Undo / version diff.
- Кастомные секции.

## 7. Acceptance criteria

- UI не показывает section chips; пользователь вводит общую правку.
- Network POST содержит `originalPrompt` + `changeRequest` + `mode: "auto"`, без `sectionLabel`/`sectionText`.
- Полный prompt в UI меняет только секции из `changes`; history хранит полный reconstructed prompt.
- Async remix job, quota, 429 — работают как раньше.
- Section mode и legacy whole-prompt mode на бэкенде сохранены для старых клиентов.

## 8. Открытые вопросы

1. Качество выбора секций classifier-ом (например, пропуск Clothing при правке одежды) — tuning classifier instruction, не transport.
2. Нужен ли fallback на whole-prompt rewrite при пустом `changes` — сейчас показываем ошибку.
