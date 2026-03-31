# Требования: кластеры запросов и маппинг страниц для продвижения Image to Prompt

> **Дата:** 2026-03-30  
> **Статус:** требования (к реализации SEO/контента)  
> **Источники данных:** [Google Trends (US, related queries)](../google_trands/searched_with_top-queries_US_20250330-1719_20260330-1719.csv), [Keyword Stats RU](../google_trands/Keyword%20Stats%202026-03-30%20at%2017_47_20.csv)  
> **Методология:** [.cursor/rules/seo-query-clustering-trends.mdc](../../.cursor/rules/seo-query-clustering-trends.mdc), при работе с RU и программным SEO — [.cursor/rules/seo-yandex-google-russia.mdc](../../.cursor/rules/seo-yandex-google-russia.mdc)

---

## 1. Контекст

**Продукт:** библиотека промптов + Chrome-расширение Image To Prompt / STV на домене `imageprompt.tools`.

**Вывод по данным:**

- Файл **Keyword Stats (RU)** в основном содержит запросы про фото, сток, ретушь, апскейл — **не** про «картинка → промпт»; прямое пересечение с продуктом **минимально** (в выгрузке заметны лишь узкие варианты вроде `image to image prompt`, `stable diffusion image to image prompt`).
- Файл **Google Trends (US)** задаёт **ядро англоязычной семантики** вокруг `image to prompt`, `prompt from image`, генераторов и брендов (ChatGPT, Gemini, Midjourney).

Для **RU-рынка** отдельно собрать семантику (Wordstat / Google Ads): «промпт по картинке», «описание для нейросети по фото», «как получить промпт из изображения» и т.п.

---

## 2. Кластеризация запросов (обзор)

| Кластер | Суть | Пригодность для продвижения i2p |
|--------|------|----------------------------------|
| **A. Image → prompt (ядро)** | Получить текст промпта из изображения | **Да, приоритет №1** |
| **B. AI image prompt / примеры** | Промпты и примеры под генерацию | **Да** (контент + long-tail к продукту) |
| **C. Prompt → image / генераторы** | Картинка из текста, генераторы | **Ограниченно** — только позиция «мы даём промпт, рендер — в MJ/SD/…» |
| **D. Image → video** | Видео из картинки | **Слабо** для ядра продукта; опционально статья по тренду |
| **E. Навигационные бренды** | ChatGPT, Gemini, Midjourney, OpenAI | **Косвенно** — гайды «промпт из картинки в …» |
| **F. RU Keyword Stats (фото/сток/ретушь)** | Массовые нерелевантные head-terms | **Нет** для главной/продукта; не размывать профиль |

---

## 3. Разбор кластеров (интент + ключевые слова)

### 3.1 Кластер A — «Image to prompt»

| Поле | Содержание |
|------|------------|
| **Интент** | Транзакционный + коммерческий: получить промпт из картинки (часто + free / ai / generator). |
| **Main keyword** | `image to prompt` |
| **Supporting** | `image to prompt ai`, `prompt from image`, `image to text prompt`, `image to prompt generator`, `image to prompt free` |
| **Long-tail** | `image to prompt ai free`, `how to get prompt from image`, `reverse prompt from photo`, `extract prompt from image midjourney` (дополнять из Wordstat / GSC) |

**Сигналы Trends:** рост у `image to prompt` (+20%), у `image to prompt ai` / связанных формулировок до +40% — усиливать блоки про **AI / reverse prompt**.

---

### 3.2 Кластер B — «AI image prompt / examples»

| Поле | Содержание |
|------|------------|
| **Интент** | Информационный → коммерческий: научиться или скопировать промпты под генерацию. |
| **Main keyword** | `ai image prompt` |
| **Supporting** | `image prompt ai`, `ai prompt image`, `prompt for ai image generator`, `ai image prompt examples` |
| **Long-tail** | `chatgpt image prompt`, `gemini ai prompt`, `midjourney image prompt`, `stable diffusion image to image prompt` |

**Сигналы Trends:** `ai image prompt examples` +250% — **приоритет отдельного гайда** + внутренняя перелинковка на карточки.

**Каннибализация:** с кластером A — один **сильный хаб** на главной + статьи/карточки, без дублирования одного и того же primary KW на нескольких URL.

---

### 3.3 Кластер C — «Prompt to image / generator»

| Поле | Содержание |
|------|------------|
| **Интент** | Коммерческий: сгенерировать картинку, найти генератор. |
| **Main keyword** | `prompt to image`, `ai image generator` |
| **Supporting** | `image generator`, `text to image ai`, `prompt to image ai free` |

**Требование:** не позиционировать сайт как **замену генераторам** без фичи генерации; при контенте — явный фрейм «промпт здесь → картинка в внешнем инструменте». Отдельный смысл и часто **другой SERP** — не смешивать primary с кластером A на одной странице.

---

### 3.4 Кластер D — «Image to video»

| Поле | Содержание |
|------|------------|
| **Интент** | Коммерческий/исследовательский: видео из изображения. |
| **Примеры из Trends** | `image to video` (+140%), `image to video ai` (+90%) |

**Требование:** не включать в ядро value proposition **Image to Prompt** до появления продукта; опционально одна **статья о тренде** или отложено.

---

### 3.5 Кластер E — бренды / общий AI

| Поле | Содержание |
|------|------------|
| **Интент** | Навигационный + смешанный. |
| **Примеры** | `chatgpt`, `gemini`, `openai`, `midjourney`, `google ai`, `grok`; `nano banana` (breakout — шум). |

**Требование:** страницы/разделы вида «промпт из картинки в ChatGPT / Gemini» — **вторичный** трафик; не делать главным KW домена.

---

### 3.6 Кластер F — выгрузка Keyword Stats (RU)

**Требование:** не таргетировать в title/description главной и продуктовых лендингов массовые запросы про **сток, ретушь, апскейл, альбомы, Photopea** и т.д. — иной интент.

Допустимо **упоминание** в образовательном контенте (например img2img и промпт), без претензии на primary под эти SERP.

---

## 4. Маппинг кластеров на типы страниц (imageprompt.tools)

| Тип страницы | URL (паттерн) | Primary-кластер | Целевые запросы (из Trends, EN; RU — зеркалировать исследованием) |
|--------------|---------------|-----------------|-------------------------------------------------------------------|
| Главная | `/{locale}/` | A (+ поддержка B) | `image to prompt`, `image to prompt ai`, `prompt from image`, `image to prompt free` — **один main KW на страницу** |
| Расширение | `/{locale}/extension-stv` | A (транзакционный) | `image to prompt generator`, Chrome extension, сценарий браузера |
| Карточка промпта | `/{locale}/p/{slug}` | B | Long-tail по стилю/инструменту, `midjourney image prompt`, примеры |
| Категории / листинги | `/{locale}/[...slug]` | B | Тематические группы + supporting |
| Поиск | `/{locale}/search` | B + long-tail | Низкочастотка; не дублировать title категорий |
| Статьи (при появлении) | `/{locale}/blog/...` | B, E, D | Примеры промптов, гайды по ChatGPT/Gemini; опционально тренд image→video |
| Опциональный лендинг | согласовать путь | C | Только при честном закрытии интента «промпт → внешняя генерация» |

---

## 5. SEO metadata — черновики (EN; для RU — отдельная локализация с тем же распределением ролей)

### 5.1 Главная (кластер A)

| Элемент | Текст (черновик) |
|---------|------------------|
| **Title** | Image to Prompt — Get AI Prompts from Any Photo \| ImagePrompt |
| **H1** | Turn any image into a ready-to-use AI prompt |
| **Meta description** | Upload a photo or browse prompts — copy structured prompts for Midjourney, SD, and more. Free library + Chrome extension. |
| **Структура H2–H3** | Как работает image to prompt · Библиотека по стилям · Расширение vs веб · Примеры · FAQ (точность, дубликаты) |

### 5.2 Страница расширения

| Элемент | Текст (черновик) |
|---------|------------------|
| **Title** | Image to Prompt Chrome Extension — Copy Prompts from Images |
| **H1** | Image To Prompt for Chrome |
| **Meta description** | Get prompts from reference images while you browse. Works with your ImagePrompt library. |

### 5.3 Статья под рост «examples» (кластер B)

| Элемент | Текст (черновик) |
|---------|------------------|
| **Title** | AI Image Prompt Examples That Actually Work (2026) |
| **H1** | AI image prompt examples |
| **H2–H3** | Структура сильного промпта · До/после · Инструмент: image → prompt |

---

## 6. Возможности из Google Trends (зафиксировано на дату выгрузки)

- Усилить **AI + from image / reverse**: рост по `image to prompt`, `image to prompt ai`, `image to image ai`.
- **Контент:** `ai image prompt examples` (+250%) — отдельный материал + внутренние ссылки на `/p/...`.
- **Бренды:** `gemini` / `gemini ai prompt` — целевой гайд при наличии ресурса.
- **Не ядро:** `image to video` — только осознанно, без размытия позиционирования.
- Игнорировать **шумовые breakout** (например `nano banana`) как основу SEO.

---

## 7. Требования против каннибализации

1. **Один primary intent-кластер на URL:** главная — **A**; `/extension-stv` не дублирует тот же main KW в title, что главная — акцент **Chrome / установка / браузер**.
2. **Кластер C** не смешивать с **primary** кластера A на одной странице (разные H1/SERP-ожидания).
3. **Keyword Stats RU:** не использовать массовые нерелевантные head-terms в метаданных продуктовых страниц ради охвата.
4. **RU:** вести отдельную таблицу запросов и маппинга; не копировать EN-кластеры без проверки Wordstat/SERP.

---

## 8. Следующие шаги (не блокируют утверждение требований)

- Выгрузка и кластеризация **RU**-семантики под «промпт из изображения».
- Согласование **фактических** `title`/`description` в `landing/src/app/[locale]/` с текущим брендингом («Промты для фото…») без нарушения правил из §7.
- Публикация гайда под кластер B при готовности контент-процесса.
