-- User-aware rate-limit merge for POST /api/extension/analyze.
--
-- Keeps the existing public.extension_rate_limit table and stores authenticated
-- users in the same bucket column as: user:<imageprompt_users.id>.
-- Anonymous buckets remain the daily ip_hash value.

create table if not exists public.extension_rate_limit_identity_merge (
  user_id       uuid not null references public.imageprompt_users (id) on delete cascade,
  ip_hash       text not null,
  window_start  timestamptz not null,
  merged_count  integer not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (user_id, ip_hash, window_start)
);

create index if not exists extension_rate_limit_identity_merge_window_idx
  on public.extension_rate_limit_identity_merge (window_start);

comment on table public.extension_rate_limit_identity_merge is
  'Idempotency checkpoints for merging anonymous extension_rate_limit ip_hash usage into Google user buckets.';

-- Idempotently copy the already-spent anonymous daily count into the stable
-- authenticated user bucket. Later calls only copy the positive delta.
create or replace function public.extension_rate_limit_merge_ip_to_user(
  p_user_id      uuid,
  p_ip_hash      text,
  p_window_start timestamptz
) returns jsonb language plpgsql as $$
declare
  v_user_bucket text := 'user:' || p_user_id::text;
  v_ip_count integer := 0;
  v_prev_merged integer := 0;
  v_delta integer := 0;
  v_user_count integer := 0;
begin
  select count into v_ip_count
  from public.extension_rate_limit
  where ip_hash = p_ip_hash
    and window_start = p_window_start;

  v_ip_count := coalesce(v_ip_count, 0);

  select merged_count into v_prev_merged
  from public.extension_rate_limit_identity_merge
  where user_id = p_user_id
    and ip_hash = p_ip_hash
    and window_start = p_window_start;

  v_prev_merged := coalesce(v_prev_merged, 0);
  v_delta := greatest(v_ip_count - v_prev_merged, 0);

  if v_delta > 0 then
    insert into public.extension_rate_limit (ip_hash, window_start, count)
    values (v_user_bucket, p_window_start, v_delta)
    on conflict (ip_hash) do update
      set count = case
            when extension_rate_limit.window_start < p_window_start
            then v_delta
            else extension_rate_limit.count + v_delta
          end,
          window_start = case
            when extension_rate_limit.window_start < p_window_start
            then p_window_start
            else extension_rate_limit.window_start
          end;
  end if;

  insert into public.extension_rate_limit_identity_merge (
    user_id,
    ip_hash,
    window_start,
    merged_count,
    updated_at
  )
  values (p_user_id, p_ip_hash, p_window_start, v_ip_count, now())
  on conflict (user_id, ip_hash, window_start) do update
    set merged_count = greatest(
          extension_rate_limit_identity_merge.merged_count,
          excluded.merged_count
        ),
        updated_at = now();

  select count into v_user_count
  from public.extension_rate_limit
  where ip_hash = v_user_bucket
    and window_start = p_window_start;

  return jsonb_build_object(
    'merged_delta', v_delta,
    'ip_count', v_ip_count,
    'user_count', coalesce(v_user_count, 0)
  );
end;
$$;
