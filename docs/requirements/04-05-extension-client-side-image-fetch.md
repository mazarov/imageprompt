# Требования: загрузка изображения на стороне расширения (client-side fetch)

| Поле | Значение |
|------|----------|
| **Статус** | Черновик требований |
| **Дата** | 2026-05-04 |
| **Продукт** | [imageprompt.tools](https://www.imageprompt.tools/) |

## Обзор для читателя

Документ описывает задачу устранения ошибки **`ETIMEDOUT`** при попытке сервера скачать изображение с `encrypted-tbn0.gstatic.com` (Google Thumbnail CDN) в маршруте `/api/vibe/extract`. Корень проблемы: сервер (Docker-контейнер) не может установить TCP-соединение с Google CDN, тогда как браузер с расширением имеет полный доступ к этим хостам. Решение — перенести скачивание и кодирование изображения **в расширение (браузер)** и передавать inline-данные (`imageBase64` + `imageMimeType`) напрямую в API, минуя серверный download.

---

## 1. Диагноз и причина проблемы

### 1.1. Текущий поток (broken)

1. Расширение получает URL картинки из Google Images: `https://encrypted-tbn0.gstatic.com/...`.
2. URL передаётся в `POST /api/vibe/extract` как поле `imageUrl`.
3. Сервер вызывает `fetchImageAsInlineData(url)` — скачивает картинку сам (`fetch` с таймаутом 15 с).
4. Сервер не может установить TCP-соединение с Google CDN → `TypeError: fetch failed` / `ETIMEDOUT` (`AggregateError`).
5. API возвращает `{ error: "fetch_failed" }` с HTTP 400; UI показывает ошибку анализа.

### 1.2. Почему ошибка именно `ETIMEDOUT`

DNS резолвится успешно (`ENOTFOUND` не появляется), но все TCP-попытки истекают по таймауту. Это признак network-level блокировки в Docker-среде или отказа Google CDN отдавать контент server-side-запросам без браузерного контекста (cookie / известный User-Agent / Referer).

### 1.3. Почему проблема выявлена только сейчас

До завершения задачи [03-04-google-auth-without-supabase-gotrue.md](03-04-google-auth-without-supabase-gotrue.md) авторизация в расширении не проходила, и полный флоу «логин → анализ картинки» не тестировался. После починки auth впервые удалось дойти до шага extract — на нём и проявилась проблема.

---

## 2. Цель и границы

**Цель:** обеспечить надёжную работу маршрута `/api/vibe/extract` для изображений с любых внешних веб-хостов (Google Images и др.) без зависимости от сетевой доступности сервера к этим хостам.

**В scope:**
- `extension/sidepanel/stv-core.js` — функция `runExtract()`: скачивание изображения в браузере → base64 → отправка в API.
- `extension/manifest.json` — `host_permissions` для fetch внешних изображений из side panel.
- `landing/src/app/api/vibe/extract/route.ts` — приём опциональных полей `imageBase64` + `imageMimeType` как готовых inline-данных.

**Вне scope:**
- Поток `referencePhoto` (Supabase Storage signed URL) — работает и не меняется.
- Поддержка hotlink-protected CDN (Pinterest, Instagram и т.п.) — отдельная задача, если понадобится.
- Удаление легаси-частей лендинга (web-embed STV, `GenerationModal`, зеркало `landing/stv-web-sidepanel/`) — отдельная задача; в текущей не требуется ни обновление зеркала, ни поддержка совместимости с ним.

---

## 3. Связь с текущей кодовой базой

| Область | Файл |
|---------|------|
| API-маршрут анализа | [landing/src/app/api/vibe/extract/route.ts](../../landing/src/app/api/vibe/extract/route.ts) — функция `POST`, шаги «download / inline data» |
| Логика вызова API из панели | [extension/sidepanel/stv-core.js](../../extension/sidepanel/stv-core.js) — `runExtract()`, `resolveExtractImageUrl()` |
| Разрешения расширения | [extension/manifest.json](../../extension/manifest.json) — секция `host_permissions` |

---

## 4. Технические требования

### 4.1. Расширение — `manifest.json`

Добавить `"<all_urls>"` в `host_permissions`, чтобы side panel мог выполнять `fetch()` к произвольным внешним хостам изображений в обход CORS.

```json
"host_permissions": [
  "https://imageprompt.tools/*",
  "https://www.imageprompt.tools/*",
  "http://localhost:3001/*",
  "https://accounts.google.com/*",
  "https://oauth2.googleapis.com/*",
  "<all_urls>"
]
```

**Обоснование:** Chrome extension side panel — привилегированный контекст (`chrome-extension://` origin). При наличии записи в `host_permissions` расширение **обходит CORS** и может читать тело ответа с любого хоста, включая Google CDN. Для будущей публикации в Chrome Web Store потребуется обоснование разрешения: «расширение анализирует изображения с произвольных веб-страниц, заранее список хостов неизвестен».

### 4.2. Расширение — `stv-core.js` (`runExtract`)

**Текущая реализация (упрощённо):**
```js
async function runExtract() {
  const imageUrl = await resolveExtractImageUrl();
  const extractBody = { imageUrl };
  // ... extractTemperature ...
  const extractData = await api("/api/vibe/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(extractBody)
  });
}
```

**Новая логика:**

1. Если источник — `referencePhoto` (Supabase Storage signed URL) → передаётся только `imageUrl`, как раньше (сервер сам скачает — у него есть доступ к собственному Storage).
2. Если источник — `state.sourceImageUrl` (внешний URL произвольного сайта):
   - Попытаться скачать изображение через `fetch(url, { signal: AbortSignal.timeout(15000) })`.
   - Прочитать тело как `ArrayBuffer`, определить `mimeType` из `Content-Type` ответа (нормализовать к одному из `image/jpeg | image/png | image/webp`; иначе считать download failed).
   - Сконвертировать в base64.
   - Отправить **обе** переменные: `imageUrl` (исходный — для записи в `vibes.source_image_url`, дебага и UX) и `imageBase64` + `imageMimeType` (для пропуска серверного скачивания).
   - **Fallback:** если client-side `fetch` упал (сетевая ошибка, не-image content-type, превышен размер) — отправить только `imageUrl`, как раньше; сервер попробует сам, и если не сможет — пользователь увидит ту же ошибку, что и до фикса. Логировать в `console.warn` факт фолбэка.

**Ограничение размера на клиенте:** не отправлять изображения > **10 МБ** (синхронно с серверным `MAX_IMAGE_BYTES`). Если по `Content-Length` или после чтения тела размер превышен — сразу падать в fallback на `imageUrl`.

**Таймаут:** `AbortSignal.timeout(15000)` — симметрично серверному.

### 4.3. API — `route.ts` (`POST /api/vibe/extract`)

**Контракт запроса:**

| Поле | Тип | Обязательность | Описание |
|------|-----|----------------|----------|
| `imageUrl` | `string` | **обязательно** | Исходный URL картинки. Записывается в `vibes.source_image_url`. |
| `imageBase64` | `string` | опционально | Base64-кодированное тело изображения (без data-URI prefix). |
| `imageMimeType` | `string` | опционально | MIME-тип: `image/jpeg` \| `image/png` \| `image/webp`. |
| `extractTemperature` | `number?` | опционально | Без изменений. |
| `extractInstructionOverride` | `string?` | опционально | Без изменений. |

**Логика обработки:**

1. **Валидация `imageUrl` для записи в `source_image_url`:** оставляем существующую `validateSafeImageUrl(imageUrl)` — она парсит URL, проверяет протокол `http/https`, исключает private-IP и localhost. Это нужно даже без серверного скачивания — мы не должны записывать в БД мусорный или внутренний URL.
2. **Если переданы `imageBase64` + `imageMimeType`:**
   - `imageMimeType` обязателен и должен входить в allowlist `["image/jpeg", "image/png", "image/webp"]` → иначе 400 (`validation_error`).
   - Длина base64 не должна превышать `Math.ceil(MAX_IMAGE_BYTES * 4 / 3)` (~13.7 МБ символов для 10 МБ бинарных данных) → иначе 400.
   - Декодировать `Buffer.from(imageBase64, "base64")`; проверить `length <= MAX_IMAGE_BYTES`.
   - Шаг `fetchImageAsInlineData` **пропускается**, на его месте — собранный inline объект `{ mimeType: imageMimeType, data: imageBase64 }`.
3. **Если `imageBase64` отсутствует:** текущее поведение — `fetchImageAsInlineData(safeUrl.toString())`.
4. **Если только `imageMimeType` без `imageBase64`** (или наоборот) → 400 (`validation_error`).

### 4.4. Логирование

| Событие | Поле | Поведение |
|---------|------|-----------|
| `request_begin` | `imageHost` | Логировать **всегда** (хост из `imageUrl`). |
| `request_begin` | `imageSource` | Новое поле: `"inline_client"` (есть `imageBase64`) или `"server_fetch"` (нет). |
| `request_begin` | `inlineBase64Chars` | Новое поле, только при `imageSource === "inline_client"`. |
| `image_download_begin` / `image_download_failed` / `image_download_ok` | — | Появляются только при `imageSource === "server_fetch"`. |

**Запрещено:** логировать содержимое `imageBase64` или его существенные префиксы.

---

## 5. Безопасность

- **Allowlist mime-type на сервере:** `imageMimeType` от клиента — недоверенный ввод, проверять строго по белому списку.
- **Лимит размера:** проверка длины base64 **до** decode, затем повторная проверка размера буфера — защита от пакета, искусственно раздутого base64-padding.
- **`source_image_url`:** проходит через `validateSafeImageUrl` (SSRF-safe + формат) и при `imageSource === "inline_client"`, чтобы в БД не попадал private-IP или некорректный URL.
- **Не логировать** содержимое base64; в `request_begin` фиксируется только длина.

---

## 6. Критерии приёмки

1. Авторизованный пользователь наводит на картинку Google Images (`encrypted-tbn0.gstatic.com`) → нажимает «image to prompt» → анализ выполняется без ошибки `fetch_failed`.
2. В логах сервера для запроса от расширения с inline-данными появляется `imageSource: "inline_client"`, **отсутствуют** `image_download_begin` / `image_download_failed`.
3. При ручной отправке только `imageUrl` (или при срабатывании клиентского fallback) сервер по-прежнему скачивает картинку сам — лог `imageSource: "server_fetch"` с прежними событиями download.
4. Поток `referencePhoto` (Supabase Storage signed URL) работает без изменений: от клиента приходит только `imageUrl`, сервер скачивает сам — `imageSource: "server_fetch"`.
5. Запросы с битым `imageMimeType` или превышением лимита base64 отклоняются с `validation_error` HTTP 400.
6. `vibes.source_image_url` содержит корректный исходный URL и при inline-потоке.
7. Версия `manifest.json` увеличена; в `host_permissions` присутствует `<all_urls>` с обоснованием в README расширения.

---

## Связанные документы

- Авторизация (предыдущая итерация): [docs/requirements/03-04-google-auth-without-supabase-gotrue.md](03-04-google-auth-without-supabase-gotrue.md)
