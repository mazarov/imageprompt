# Analytics dashboard setup (Metabase)

Все SQL-артефакты готовы. Этот документ описывает ручные операторские шаги для запуска дашборда.

## Порядок применения миграций в Supabase

Выполнить в Supabase → SQL Editor строго по порядку:

1. `docs/sql/14-01-analytics-generation-source.sql` — добавляет колонку `client_source` и индексы в `landing_generations`.
2. `docs/sql/14-02-extension-analyze-events.sql` — создаёт таблицу `extension_analyze_events`.
3. `docs/sql/14-03-analytics-views.sql` — создаёт три аналитических вьюхи.
4. `docs/sql/14-04-analytics-readonly-role.sql` — создаёт роль `analytics_ro` (**заменить `<SET_STRONG_PASSWORD>` перед запуском**).
5. `docs/sql/14-05-analytics-origin-and-allowed-filter.sql` — колонка `request_origin`, вьюхи считают только `allowed=true` запросы.
6. `docs/sql/14-06-extension-rate-limit-increment-if-allowed.sql` — атомарный increment без PK race (legacy; reserve flow в 14-07).
7. `docs/sql/14-07-extension-rate-limit-reservations.sql` — колонка `pending`, RPC reserve/confirm/release (**обязательно перед деплоем landing с reserve flow**).

После применения 14-01 и 14-02 — деплоить код лендинга (иначе insert с `client_source` упадёт на отсутствующую колонку).

После применения 14-07 — деплоить landing с reserve/confirm/release (analyze + remix). Env для burst limit (опционально): `EXTENSION_BURST_LIMIT_ENABLED=true`, `EXTENSION_BURST_LIMIT_PER_MIN=10`.

## Структура данных

| Вьюха | Назначение |
|---|---|
| `analytics_requests` | Единая фактовая таблица: генерации + analyze/remix. Поля: `event_id`, `kind`, `event_time`, `user_id`, `ip_hash`, `client_source`, `allowed`, `request_origin`. |
| `analytics_user_activity` | Сводка по пользователю: `total_requests`, `generations`, `analyzes`, `first_seen`, `last_seen`. |
| `analytics_clients_daily` | Дневная разбивка по клиенту × виду запроса: `day`, `client_source`, `kind`, `requests`, `unique_actors`. |

Канонические значения `client_source`: `site`, `embed_stv`, `extension_stv`, `extension_lite`, `promptshot`, `unknown`.

## Встроенный дашборд на лендинге (рекомендуется)

URL: **`https://imageprompt.tools/admin/analytics`**

Доступ: Google-логин + email в env **`ANALYTICS_ADMIN_EMAILS`** (через `;` или `,`).

```bash
# landing/.env.local или prod env на Dockhost
ANALYTICS_ADMIN_EMAILS=you@example.com;other@example.com
```

Карточки: всего пользователей, активные за 30 дней, запросы за период, генерации/analyze.  
График: stacked bar по клиентам. Таблица: топ пользователей.

API: `GET /api/admin/analytics?days=30` (только для allowlist, cookie session).

## Запуск Metabase (Docker)

Опционально, если нужен полноценный BI. Альтернатива без отдельного сервера — **встроенный дашборд на лендинге** (см. ниже).

```bash
docker run -d \
  --name metabase \
  -p 3000:3000 \
  -e MB_DB_FILE=/metabase-data/metabase.db \
  -v metabase-data:/metabase-data \
  metabase/metabase
```

Открыть http://localhost:3000, пройти wizard.

## Подключение к Supabase Postgres

В Metabase → Admin → Databases → Add Database → PostgreSQL:

| Поле | Значение |
|---|---|
| Host | `aws-0-<region>.pooler.supabase.com` (session pooler, порт 5432) |
| Port | `5432` |
| Database | `postgres` |
| Username | `analytics_ro` |
| Password | пароль из 14-04 |
| SSL | включить |

> Строку подключения берём из Supabase → Project Settings → Database → Connection string (URI), заменяем пользователя на `analytics_ro`.

## Сборка дашборда

Создать новый Dashboard, добавить карточки:

### 1. Всего пользователей
```sql
select count(*) as total_users from imageprompt_users;
```

### 2. Активные пользователи (видели запрос за последние 30 дней)
```sql
select count(distinct user_id) as active_users
from analytics_requests
where event_time >= now() - interval '30 days'
  and user_id is not null;
```

### 3. Запросы по клиентам (stacked bar по дням)
Источник: вьюха `analytics_clients_daily`.
В Metabase → New Question → Raw Data → `analytics_clients_daily`.
Summarize: сумма `requests` по `day` (X), разбивка `client_source` (цвет).
Тип: Stacked Bar Chart.

### 4. Топ пользователей по объёму
Источник: `analytics_user_activity`.
```sql
select email, total_requests, generations, analyzes, last_seen
from analytics_user_activity
order by total_requests desc
limit 50;
```

### 5. Фильтры дашборда
- Date Range → `event_time` / `day`
- `client_source` — dropdown из `analytics_clients_daily`

## Проверка после деплоя кода

```sql
-- Должны быть строки с client_source != null после деплоя:
select client_source, count(*) from landing_generations
where created_at > now() - interval '1 hour'
group by 1;

-- Должны быть строки в таблице событий analyze:
select client_source, endpoint, allowed, count(*)
from extension_analyze_events
where created_at > now() - interval '1 hour'
group by 1, 2, 3;

-- Дашборд-вьюха работает:
select * from analytics_clients_daily
order by day desc limit 20;
```
