-- Analytics views for BI dashboard (Metabase / Grafana / Supabase Studio).
-- Recreate after any schema changes to the underlying tables.
-- Requires: 14-01-analytics-generation-source.sql + 14-02-extension-analyze-events.sql applied first.

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
    coalesce(g.client_source, 'unknown')     as client_source
  from public.landing_generations g
  union all
  select
    e.id::text                               as event_id,
    'analyze'::text                          as kind,
    e.created_at                             as event_time,
    e.user_id::text                          as user_id,
    e.ip_hash                                as ip_hash,
    coalesce(e.client_source, 'unknown')     as client_source
  from public.extension_analyze_events e;

comment on view public.analytics_requests is
  'Unified analytics fact: one row per generation or analyze/remix call.';

-- ---------------------------------------------------------------------------
-- analytics_user_activity — per-user rollup (logged-in users only)
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
  left join public.analytics_requests r on r.user_id = u.id::text
  group by u.id, u.email, u.created_at;

comment on view public.analytics_user_activity is
  'Per-user activity rollup: total requests, generations, analyzes, first/last seen.';

-- ---------------------------------------------------------------------------
-- analytics_clients_daily — daily breakdown by client × kind
-- ---------------------------------------------------------------------------
create or replace view public.analytics_clients_daily as
  select
    date_trunc('day', event_time)                   as day,
    client_source,
    kind,
    count(*)                                        as requests,
    count(distinct coalesce(user_id, ip_hash))      as unique_actors
  from public.analytics_requests
  group by 1, 2, 3;

comment on view public.analytics_clients_daily is
  'Daily request volume and unique actors per client source and request kind.';
