-- Analyze/Remix correctness analytics:
--   (A) enrich the server fact table extension_analyze_events with the real outcome
--       (success / truncated / errors) so `allowed` is no longer overloaded;
--   (B) add a client-side funnel table extension_client_events (clicks, start ok/err,
--       result/error shown, copy prompt) with locale/device dimensions;
--   (C) a funnel view joining both planes by correlation_id.
-- Apply after 14-02..14-05. Idempotent.

-- ---------------------------------------------------------------------------
-- (A) Server outcome on the existing per-request fact table.
--     `allowed` keeps its original meaning (rate-limit pass); `outcome` carries
--     the real result of the backend call.
-- ---------------------------------------------------------------------------
alter table public.extension_analyze_events
  add column if not exists correlation_id   text,
  add column if not exists outcome          text,    -- success|truncated|rate_limited|upstream_error|empty_response|invalid_request|config_error
  add column if not exists error_code       text,    -- timeout|fetch_failed|gemini_http|max_tokens|empty_prompt|invalid_image|config|null
  add column if not exists finish_reason    text,    -- raw Gemini finishReason: STOP|MAX_TOKENS|SAFETY|...
  add column if not exists truncated        boolean default false,
  add column if not exists http_status      int,
  add column if not exists latency_ms       int,
  add column if not exists locale           text,
  add column if not exists style            text,
  add column if not exists model            text,
  add column if not exists missing_sections int;

comment on column public.extension_analyze_events.outcome is
  'Real backend result: success|truncated|rate_limited|upstream_error|empty_response|invalid_request|config_error.';
comment on column public.extension_analyze_events.truncated is
  'Heuristic: response likely cut off (finishReason MAX_TOKENS, missing sections, mid-sentence).';
comment on column public.extension_analyze_events.correlation_id is
  'Shared id (= extension job id) linking the client funnel row to this server fact.';

create index if not exists extension_analyze_events_outcome_idx
  on public.extension_analyze_events (outcome);
create index if not exists extension_analyze_events_locale_idx
  on public.extension_analyze_events (locale);
create index if not exists extension_analyze_events_correlation_idx
  on public.extension_analyze_events (correlation_id);

-- ---------------------------------------------------------------------------
-- (B) Client funnel fact: one row per UI/client event (before & after backend).
--     ip_hash / user_id are derived server-side; the client never sends raw PII.
-- ---------------------------------------------------------------------------
create table if not exists public.extension_client_events (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  client_ts      timestamptz,                          -- event time on the client
  event          text not null,                        -- mode_click|request_start_ok|request_start_error|result_shown|error_shown|copy_prompt|image_ingest_error
  mode           text,                                 -- analyze|remix
  trigger        text,                                 -- popup_button|draft|context_menu|overlay|paste|drop|remix_submit|...
  correlation_id text,                                 -- = extension job id, joins to extension_analyze_events
  session_id     text,                                 -- per popup session
  client_source  text,                                 -- extension_lite|site|...
  ip_hash        text,
  user_id        uuid references public.imageprompt_users (id) on delete set null,
  locale         text,
  platform       text,                                 -- mac|win|linux|cros|android|...
  browser        text,                                 -- chrome|edge|brave|opera|...
  ext_version    text,
  style          text,
  surface        text,                                 -- result|history (for copy_prompt)
  error_code     text,
  detail         jsonb
);

comment on table public.extension_client_events is
  'Client-side analyze/remix funnel: clicks, backend-start ok/err, result/error shown, copy. Joins to extension_analyze_events via correlation_id.';

create index if not exists ece_created_idx on public.extension_client_events (created_at);
create index if not exists ece_event_idx   on public.extension_client_events (event);
create index if not exists ece_corr_idx     on public.extension_client_events (correlation_id);
create index if not exists ece_locale_idx   on public.extension_client_events (locale);
create index if not exists ece_user_idx     on public.extension_client_events (user_id);

-- ---------------------------------------------------------------------------
-- (C) Daily funnel view by client/locale/device.
-- ---------------------------------------------------------------------------
create or replace view public.analytics_extension_funnel as
  select
    date_trunc('day', created_at)                                            as day,
    coalesce(mode, 'unknown')                                                as mode,
    coalesce(client_source, 'unknown')                                       as client_source,
    coalesce(locale, 'unknown')                                              as locale,
    coalesce(platform, 'unknown')                                            as platform,
    coalesce(browser, 'unknown')                                             as browser,
    count(*) filter (where event = 'mode_click')                             as clicks,
    count(*) filter (where event = 'request_start_ok')                       as starts_ok,
    count(*) filter (where event = 'request_start_error')                    as starts_err,
    count(*) filter (where event = 'result_shown')                           as results_shown,
    count(*) filter (where event = 'error_shown')                            as errors_shown,
    count(*) filter (where event = 'copy_prompt')                            as copies,
    count(distinct coalesce(user_id::text, ip_hash))
      filter (where event = 'mode_click')                                    as unique_users_clicked
  from public.extension_client_events
  group by 1, 2, 3, 4, 5, 6;

comment on view public.analytics_extension_funnel is
  'Daily analyze/remix client funnel (clicks -> start -> result/error -> copy) sliced by client, locale and device.';

-- ---------------------------------------------------------------------------
-- (C2) Daily backend outcome quality view (success / truncation / error mix).
-- ---------------------------------------------------------------------------
create or replace view public.analytics_extension_outcomes_daily as
  select
    date_trunc('day', created_at)                                            as day,
    endpoint,
    coalesce(client_source, 'unknown')                                       as client_source,
    coalesce(locale, 'unknown')                                              as locale,
    coalesce(style, 'unknown')                                               as style,
    count(*)                                                                 as requests,
    count(*) filter (where outcome = 'success')                              as success,
    count(*) filter (where truncated)                                        as truncated,
    count(*) filter (where outcome = 'rate_limited')                         as rate_limited,
    count(*) filter (where outcome = 'upstream_error')                       as upstream_error,
    count(*) filter (where outcome = 'empty_response')                       as empty_response,
    count(distinct coalesce(user_id::text, ip_hash))                         as unique_actors
  from public.extension_analyze_events
  group by 1, 2, 3, 4, 5;

comment on view public.analytics_extension_outcomes_daily is
  'Daily analyze/remix backend outcome mix (success/truncated/errors) by client, locale and style.';
