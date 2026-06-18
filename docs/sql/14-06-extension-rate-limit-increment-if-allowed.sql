-- Charge extension analyze/remix quota only after a successful upstream response.
-- Apply in Supabase SQL Editor before deploying landing code that calls
-- extension_rate_limit_increment_if_allowed.
--
-- v2: INSERT ON CONFLICT + FOR UPDATE — no PK race on concurrent cold buckets.

create or replace function public.extension_rate_limit_increment_if_allowed(
  p_ip_hash      text,
  p_window_start timestamptz,
  p_max_count    integer default 30
) returns jsonb language plpgsql as $$
declare
  v_count  integer;
  v_window timestamptz;
begin
  insert into public.extension_rate_limit (ip_hash, window_start, count)
  values (p_ip_hash, p_window_start, 0)
  on conflict (ip_hash) do nothing;

  select count, window_start
  into v_count, v_window
  from public.extension_rate_limit
  where ip_hash = p_ip_hash
  for update;

  if v_window < p_window_start then
    update public.extension_rate_limit
    set window_start = p_window_start,
        count = 1
    where ip_hash = p_ip_hash;
    return jsonb_build_object('allowed', true, 'count', 1);
  end if;

  if v_count >= p_max_count then
    return jsonb_build_object('allowed', false, 'count', v_count);
  end if;

  update public.extension_rate_limit
  set count = count + 1
  where ip_hash = p_ip_hash
  returning count into v_count;

  return jsonb_build_object('allowed', true, 'count', v_count);
end;
$$;

comment on function public.extension_rate_limit_increment_if_allowed(text, timestamptz, integer) is
  'Atomically increments the daily extension quota bucket when count < max; no-op when already exhausted.';
