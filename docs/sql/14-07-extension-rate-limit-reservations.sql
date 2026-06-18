-- Reserve in-flight extension quota before Gemini; confirm on success, release on failure.
-- Apply after 14-06. Required before deploying landing reserve/confirm/release flow.

alter table public.extension_rate_limit
  add column if not exists pending integer not null default 0;

comment on column public.extension_rate_limit.pending is
  'In-flight reservations (reserved before upstream, confirmed or released after).';

-- Reserve one slot when count + pending < max.
create or replace function public.extension_rate_limit_reserve_if_allowed(
  p_ip_hash      text,
  p_window_start timestamptz,
  p_max_count    integer default 30
) returns jsonb language plpgsql as $$
declare
  v_count   integer;
  v_pending integer;
  v_window  timestamptz;
begin
  insert into public.extension_rate_limit (ip_hash, window_start, count, pending)
  values (p_ip_hash, p_window_start, 0, 0)
  on conflict (ip_hash) do nothing;

  select count, pending, window_start
  into v_count, v_pending, v_window
  from public.extension_rate_limit
  where ip_hash = p_ip_hash
  for update;

  if v_window < p_window_start then
    update public.extension_rate_limit
    set window_start = p_window_start,
        count = 0,
        pending = 1
    where ip_hash = p_ip_hash;
    return jsonb_build_object('allowed', true, 'count', 0, 'pending', 1);
  end if;

  if v_count + v_pending >= p_max_count then
    return jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'pending', v_pending
    );
  end if;

  update public.extension_rate_limit
  set pending = pending + 1
  where ip_hash = p_ip_hash
  returning count, pending into v_count, v_pending;

  return jsonb_build_object(
    'allowed', true,
    'count', v_count,
    'pending', v_pending
  );
end;
$$;

-- Move one reservation into committed count after upstream success.
create or replace function public.extension_rate_limit_confirm_reservation(
  p_ip_hash      text,
  p_window_start timestamptz
) returns jsonb language plpgsql as $$
declare
  v_count   integer;
  v_pending integer;
  v_window  timestamptz;
begin
  insert into public.extension_rate_limit (ip_hash, window_start, count, pending)
  values (p_ip_hash, p_window_start, 0, 0)
  on conflict (ip_hash) do nothing;

  select count, pending, window_start
  into v_count, v_pending, v_window
  from public.extension_rate_limit
  where ip_hash = p_ip_hash
  for update;

  if v_window < p_window_start then
    return jsonb_build_object('allowed', false, 'count', 0, 'pending', 0);
  end if;

  if v_pending <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'pending', v_pending
    );
  end if;

  update public.extension_rate_limit
  set pending = pending - 1,
      count = count + 1
  where ip_hash = p_ip_hash
  returning count, pending into v_count, v_pending;

  return jsonb_build_object(
    'allowed', true,
    'count', v_count,
    'pending', v_pending
  );
end;
$$;

-- Drop reservation without charging committed count (upstream failure).
create or replace function public.extension_rate_limit_release_reservation(
  p_ip_hash      text,
  p_window_start timestamptz
) returns jsonb language plpgsql as $$
declare
  v_count   integer;
  v_pending integer;
  v_window  timestamptz;
begin
  insert into public.extension_rate_limit (ip_hash, window_start, count, pending)
  values (p_ip_hash, p_window_start, 0, 0)
  on conflict (ip_hash) do nothing;

  select count, pending, window_start
  into v_count, v_pending, v_window
  from public.extension_rate_limit
  where ip_hash = p_ip_hash
  for update;

  if v_window < p_window_start or v_pending <= 0 then
    return jsonb_build_object(
      'allowed', false,
      'count', v_count,
      'pending', v_pending
    );
  end if;

  update public.extension_rate_limit
  set pending = pending - 1
  where ip_hash = p_ip_hash
  returning count, pending into v_count, v_pending;

  return jsonb_build_object(
    'allowed', true,
    'count', v_count,
    'pending', v_pending
  );
end;
$$;

comment on function public.extension_rate_limit_reserve_if_allowed(text, timestamptz, integer) is
  'Atomically reserves one in-flight slot when count + pending < max.';

comment on function public.extension_rate_limit_confirm_reservation(text, timestamptz) is
  'Confirms a reservation: pending -= 1, count += 1.';

comment on function public.extension_rate_limit_release_reservation(text, timestamptz) is
  'Releases a reservation after upstream failure: pending -= 1.';
