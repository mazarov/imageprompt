# Prompt Remix — требования

> Доработка существующей фичи: после получения промпта (из картинки) пользователь выбирает **конкретную секцию** (`Scene`, `Genre`, `Pose`, …), описывает изменение и получает переписанный промпт — меняется только выбранный абзац, остальное сохраняется локально без повторной загрузки картинки.
> Бэкенд-эндпоинт `POST /api/extension/remix` реализован в `landing/src/app/api/extension/remix/route.ts`. UI в `extension-lite/` — section-scoped remix composer.
> Дата: 18.06.2026 (обновлено 19.06.2026 — section mode).

## 1. Идея

Поток в `extension-lite`: картинка → структурированный промпт с секциями → пользователь выбирает секцию chip-ом → вводит change request → «Remix». Backend получает **только текст выбранной секции**; расширение локально подставляет обновлённый абзац обратно в полный prompt. Картинку повторно не загружаем.

Итеративный ремикс: каждый следующий remix применяется к уже собранному полному промпту; по умолчанию выбранная секция сохраняется между remix-ами, если она всё ещё есть в тексте.

## 2. Пользовательские сценарии

A. **Section remix.** Result → chip `Scene` (выбран по умолчанию) → «make it night» → Remix → в prompt-box меняется только блок Scene.

B. **Смена секции.** Тап по `Clothing` → prompt-box прокручивается к Clothing, chip подсвечивается → change request → remix только Clothing.

C. **Итеративный ремикс.** После успеха инпут очищается; можно снова выбрать секцию и remix.

D. **Промпт без заголовков.** Parser возвращает одну fallback-секцию `Prompt`; remix отправляет весь текст как `sectionText`.

E. **Лимит исчерпан.** 429 → тот же rate-limit экран, что у analyze.

## 3. Контракт бэкенда

- **Метод и путь:** `POST /api/extension/remix`

### 3.1 Section mode (основной, extension-lite ≥ section remix)

**Request:**
```json
{
  "sectionLabel": "Scene",
  "sectionText": "Scene:\nA person stands…",
  "changeRequest": "make it night",
  "style": "photoreal"
}
```

- `sectionLabel` — обязателен, ≤ 64 символов (`Scene`, `CRITICAL RULES`, …).
- `sectionText` — обязателен, ≤ 3000 символов (heading + body выбранной секции).
- `changeRequest` — обязателен, ≤ 1000 символов.
- `originalPrompt` **не** отправляется в section mode.

**Response (ok):**
```json
{ "sectionText": "Scene:\n…", "remaining": 27, "count": 3, "max": 30 }
```

Gemini переписывает только переданную секцию. `maxOutputTokens: 2048`.

### 3.2 Legacy mode (fallback для старых клиентов)

**Request:**
```json
{
  "originalPrompt": "string, ≤ 8000",
  "changeRequest": "string, ≤ 1000",
  "style": "photoreal | midjourney | sd | flux"
}
```

**Response (ok):** `{ "prompt": "string", …quota }` — полный переписанный промпт.

### 3.3 Общее

- **429 / 5xx** — без изменений (см. предыдущую версию документа).
- **Rate-limit:** общий с analyze; reserve → Gemini → confirm/release.
- **Provider:** Gemini 2.5 Flash-Lite, `temperature: 0.4`, `thinkingBudget: 0`.
- Section instruction: переписать только переданную секцию, сохранить heading, не упоминать другие секции, вернуть только текст секции.

## 4. Реализация в `extension-lite/`

### 4.1 Section chips + composer

Над composer — **section chips** (не quick prompts): `Scene` · `Genre` · `Pose` · `Lighting` · `Camera` · `Mood` · `Color` · `Clothing` · `Composition` · `Rules`. Все chips видны сразу (`flex-wrap`, без горизонтального скролла). Одна секция всегда выбрана (default: первая, обычно Scene).

```
┌───────────────────────────────┐
│  [ img preview ]   Copy  Another│
├───────────────────────────────┤
│  PROMPT                         │
│  ┌─────────────────────────┐    │
│  │ Scene: …                │    │
│  │ Genre: …                │    │
│  └─────────────────────────┘    │
│  EDIT SECTION                   │
│  Scene Genre Pose … Rules       │  ← section chips (wrap)
│  ┌───────────────────────┬──┐   │
│  │ Change this section…  │ ↑│   │
│  └───────────────────────┴──┘   │
└───────────────────────────────┘
```

### 4.2 Parser (`lib/prompt-sections.js`)

- `parsePromptSections(prompt)` — секции с `key`, `label`, `chipLabel`, `heading`, `body`, `text`, `start`, `end`.
- `replacePromptSection(prompt, sectionKey, updatedSectionText)` — локальная сборка полного prompt.
- `normalizeSectionText(label, text, heading)` — гарантирует heading в ответе Gemini.

### 4.3 Popup (`popup.js`)

- `syncPromptSections()` после `showResult`.
- `selectRemixSection(key)` — chip + прокрутка prompt-box (`.section-focused`).
- `submitRemix()` отправляет `sectionKey`, `sectionLabel`, `sectionText`, `originalPrompt` (только для SW, не на API).
- Кнопка Remix disabled без текста **и** без выбранной секции.

### 4.4 Service worker (`background.js`)

- Async remix job (сохранён): `startLiteRemixJob` → `completeLiteRemixJob`.
- API body: `{ sectionLabel, sectionText, changeRequest, style }`.
- После ответа: `normalizeSectionText` + `replacePromptSection` → полный prompt в job/history/popup.
- Context menu duplicate-id fix и `resumePendingRemixJob` сохранены.

## 5. Тексты UI (English)

| Ключ | Текст |
|------|-------|
| `remixSectionLabel` | `Edit section` |
| `remixChipsAria` | `Prompt sections` |
| `remixPlaceholder` | `Change this section…` |
| `remixSelectSectionError` | `Choose a section to edit.` |
| `remixButtonAria` | `Remix prompt` |
| `remixLoading` | `Remixing…` |
| `remixError` | `Couldn't remix the prompt. Please try again.` |

Quick-chip ключи (`remixChipNight`, …) удалены.

## 6. Чего НЕТ в этой итерации

- Rich-text подсветка диапазона в `#prompt-box` (только approximate scroll).
- Отправка полного prompt на backend в section mode.
- Undo / version diff.
- Кастомные chips.

## 7. Acceptance criteria

- Все section chips видны без horizontal scroll; одна выбрана по умолчанию.
- Network POST содержит `sectionLabel` + `sectionText`, без `originalPrompt`.
- Полный prompt в UI меняет только выбранную секцию; history хранит полный reconstructed prompt.
- Async remix job, quota, 429, `prefers-reduced-motion` — работают как раньше.
- Legacy API mode (`originalPrompt`) остаётся для старых клиентов.

## 8. Открытые вопросы

1. Качество правок Gemini для отдельных секций (например, игнор Clothing) — tuning instruction, не transport.
2. Нужен ли chip label `Rules` vs полный `CRITICAL RULES` — сейчас compact `Rules`.
