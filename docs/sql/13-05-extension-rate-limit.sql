-- Rate-limit table for POST /api/extension/analyze
-- One row per IP hash; window resets each calendar day (UTC).
-- Run this in Supabase SQL Editor or psql before deploying the endpoint.

create table if not exists public.extension_rate_limit (
  ip_hash       text primary key,
  window_start  timestamptz not null,
  count         integer not null default 0
);

create index if not exists extension_rate_limit_window_idx
  on public.extension_rate_limit (window_start);

-- Atomic upsert: increments counter within the same 24 h window,
-- resets to 1 when a new window_start is detected (new day).
-- Returns { "allowed": true/false, "count": N }.
create or replace function public.extension_rate_limit_check_and_increment(
  p_ip_hash      text,
  p_window_start timestamptz,
  p_max_count    integer default 30
) returns jsonb language plpgsql as $$
declare
  v_count integer;
begin
  insert into public.extension_rate_limit (ip_hash, window_start, count)
  values (p_ip_hash, p_window_start, 1)
  on conflict (ip_hash) do update
    set count = case
          when extension_rate_limit.window_start < p_window_start
          then 1
          else extension_rate_limit.count + 1
        end,
        window_start = case
          when extension_rate_limit.window_start < p_window_start
          then p_window_start
          else extension_rate_limit.window_start
        end
  returning count into v_count;

  return jsonb_build_object('allowed', v_count <= p_max_count, 'count', v_count);
end;
$$;
