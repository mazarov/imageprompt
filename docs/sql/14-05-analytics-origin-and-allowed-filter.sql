-- Analytics: store raw Origin for debugging + count only rate-limit-passing requests in views.
-- Apply after 14-02..14-03.

alter table public.extension_analyze_events
  add column if not exists request_origin text;

comment on column public.extension_analyze_events.request_origin is
  'Raw Origin request header at event time (debug / attribution audit).';

-- ---------------------------------------------------------------------------
-- analytics_requests — unified request fact across paid generations + free analyze/remix
-- ---------------------------------------------------------------------------
create or replace view public.analytics_requests as
  select
    g.id::text                               as event_id,
    'generation'::text                       as kind,
    g.created_at                             as event_time,
    g.user_id::text                          as user_id,
    null::text                               as ip_hash,
    coalesce(g.client_source, 'unknown')     as client_source,
    true                                     as allowed,
    null::text                               as request_origin
  from public.landing_generations g
  union all
  select
    e.id::text                               as event_id,
    e.endpoint                               as kind,
    e.created_at                             as event_time,
    e.user_id::text                          as user_id,
    e.ip_hash                                as ip_hash,
    coalesce(e.client_source, 'unknown')     as client_source,
    e.allowed                                as allowed,
    e.request_origin                         as request_origin
  from public.extension_analyze_events e;

comment on view public.analytics_requests is
  'Unified analytics fact: one row per generation or analyze/remix call.';

-- ---------------------------------------------------------------------------
-- analytics_user_activity — per-user rollup (logged-in users only, allowed requests)
-- ---------------------------------------------------------------------------
create or replace view public.analytics_user_activity as
  select
    u.id::text                                          as user_id,
    u.email,
    u.created_at                                        as user_created_at,
    count(r.event_id)                                   as total_requests,
    count(r.event_id) filter (where r.kind = 'generation') as generations,
    count(r.event_id) filter (where r.kind = 'analyze')    as analyzes,
    min(r.event_time)                                   as first_seen,
    max(r.event_time)                                   as last_seen
  from public.imageprompt_users u
  left join public.analytics_requests r
    on r.user_id = u.id::text
   and coalesce(r.allowed, true) = true
  group by u.id, u.email, u.created_at;

comment on view public.analytics_user_activity is
  'Per-user activity rollup: allowed requests only.';

-- ---------------------------------------------------------------------------
-- analytics_clients_daily — daily breakdown by client × kind (allowed requests only)
-- ---------------------------------------------------------------------------
create or replace view public.analytics_clients_daily as
  select
    date_trunc('day', event_time)                   as day,
    client_source,
    kind,
    count(*)                                        as requests,
    count(distinct coalesce(user_id, ip_hash))      as unique_actors
  from public.analytics_requests
  where coalesce(allowed, true) = true
  group by 1, 2, 3;

comment on view public.analytics_clients_daily is
  'Daily allowed request volume and unique actors per client source and request kind.';
