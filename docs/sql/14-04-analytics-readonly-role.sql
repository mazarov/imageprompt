-- Read-only role for BI tools (Metabase / Grafana / Supabase Studio).
-- Replace <SET_STRONG_PASSWORD> with a real password before running.
-- Apply in Supabase SQL Editor by a project owner (requires superuser for CREATE ROLE).

create role analytics_ro login password '<SET_STRONG_PASSWORD>';

grant connect on database postgres to analytics_ro;
grant usage on schema public to analytics_ro;

grant select on
  public.analytics_requests,
  public.analytics_user_activity,
  public.analytics_clients_daily
to analytics_ro;

-- Optional: also expose imageprompt_users for user-count cards in the dashboard.
grant select on public.imageprompt_users to analytics_ro;

comment on role analytics_ro is
  'Read-only BI role. Has SELECT on analytics views only — no raw table access except imageprompt_users.';
