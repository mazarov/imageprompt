# Analyze history (admin)

Админ-страница для просмотра фото и промтов после успешного `POST /api/extension/analyze` со всех фронтов (site, promptshot.ru, extension-lite).

## Миграция

1. Применить [`docs/sql/14-09-analyze-history.sql`](sql/14-09-analyze-history.sql) в Supabase SQL Editor.
2. Убедиться, что private bucket **`analyze-history`** существует (миграция создаёт его через `storage.buckets`; при необходимости — Dashboard → Storage → New bucket, **Public off**).
3. Для публикации выбранных анализов применить [`docs/sql/14-12-analyze-history-publishing.sql`](sql/14-12-analyze-history-publishing.sql).
4. Деплоить landing с кодом записи и админ-UI.

Порядок: после **14-08**, см. также [`analytics-dashboard-setup.md`](analytics-dashboard-setup.md).

## Данные

| Объект | Назначение |
|---|---|
| `public.analyze_history` | Строка на каждый успешный analyze: source, prompt, metadata, `image_path` |
| Storage bucket `analyze-history` | JPEG-превью (max 1024px long side), путь `YYYY/MM/DD/<uuid>.jpg` |
| Storage bucket `web-generation-results` | Публичная копия только выбранного для публикации фото |

Запись только при HTTP 200 и непустом промте (включая truncated). Ошибки storage/insert **не** влияют на ответ analyze.

Обработка изображения: **sharp** resize → JPEG; при ошибке sharp — сырые байты с отсечкой **3 MB**.

## Retention (30 дней)

- Строки и файлы старше 30 дней удаляются **lazy**: при первом `GET /api/admin/analyze-history` за UTC-день (батчами по 100).
- Опционально в миграции закомментирован `pg_cron` только для строк БД; файлы всё равно чистит admin API.

## Доступ

- URL: **`/admin/analyze-history`**
- Авторизация: Google-сессия + allowlist **`ANALYTICS_ADMIN_EMAILS`** (тот же env, что у `/admin/analytics`).
- API: `GET /api/admin/analyze-history?client_source=&cursor=&limit=30`
- Публикация: `POST /api/admin/analyze-history/:id/publish`

## Публикация

Кнопка **«Опубликовать»** создаёт обычную публичную prompt-card из фото и промта
анализа. Фото сначала копируется из приватного `analyze-history` в публичный
`web-generation-results`, поэтому остальные неопубликованные фото остаются
закрытыми. Повторный запрос идемпотентен и возвращает уже созданную карточку.

SEO-категории для analyze и admin generation проходят через общий классификатор
`landing/src/lib/seo-tags-classify.ts`. Перед записью он:

- принимает только slug из `TAG_REGISTRY` в правильном dimension;
- оставляет неизвестные slug только в диагностическом `new_tags`;
- отклоняет ответы с аномально большим числом тегов или дампом значительной
  части реестра;
- повторяет классификацию с очищенным промтом, а после исчерпания попыток
  возвращает `tagging_failed` и оставляет карточку черновиком.

Аудит уже опубликованных карточек запускается из `landing/` без изменений БД:

```bash
npm run audit:seo-tags
```

После проверки списка безопасный пересчёт только найденных аномалий:

```bash
npm run repair:seo-tags
```

Поддерживаются `--limit N`, `--card-id <uuid>` и `--sleep-ms N`. Обновление
происходит только после успешной классификации, прошедшей тот же guard. При
наличии `PROMPTSHOT_REVALIDATE_URL` и `PROMPTSHOT_REVALIDATE_SECRET` скрипт
также сбрасывает кеш исправленной карточки.

Новых env-переменных не требуется.

## Follow-up (вне этой задачи)

В репозитории **aiphoto** (promptshot.ru) добавить заголовок `X-Client: promptshot` в виджет analyze, чтобы атрибуция не зависела от Origin (dev-прокси может его терять). В проде Origin доходит корректно.
