-- Admin generation queue: support unpublished | published | all filters.
-- Apply in Supabase SQL Editor before deploying GET /api/admin/generations?status=...

create or replace function public.admin_generations_queue(
  p_status text default 'unpublished',
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  created_at timestamptz,
  generation_completed_at timestamptz,
  prompt_text text,
  model text,
  aspect_ratio text,
  image_size text,
  result_storage_bucket text,
  result_storage_path text,
  ugc_card_id uuid,
  card_exists boolean,
  is_published boolean,
  source_channel text,
  card_slug text
)
language sql
stable
as $$
  select
    g.id,
    g.created_at,
    g.generation_completed_at,
    g.prompt_text,
    g.model,
    g.aspect_ratio,
    g.image_size,
    g.result_storage_bucket,
    g.result_storage_path,
    g.ugc_card_id,
    (c.id is not null) as card_exists,
    coalesce(c.is_published, false) as is_published,
    c.source_channel,
    c.slug as card_slug
  from public.landing_generations g
  left join public.prompt_cards c on c.id = g.ugc_card_id
  where g.client_source = 'admin'
    and g.status = 'completed'
    and (
      case lower(coalesce(p_status, 'unpublished'))
        when 'published' then c.id is not null and c.is_published = true
        when 'all' then true
        else (
          g.ugc_card_id is null
          or c.id is null
          or c.is_published = false
        )
      end
    )
    and (
      p_cursor_created_at is null
      or p_cursor_id is null
      or g.created_at < p_cursor_created_at
      or (g.created_at = p_cursor_created_at and g.id < p_cursor_id)
    )
  order by g.created_at desc, g.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100)) + 1;
$$;

revoke all on function public.admin_generations_queue(text, timestamptz, uuid, integer) from public;
grant execute on function public.admin_generations_queue(text, timestamptz, uuid, integer) to service_role;

comment on function public.admin_generations_queue is
  'Returns admin completed generations filtered by publication status: unpublished | published | all.';

-- Keep legacy RPC for older deploys; delegate to new function.
create or replace function public.admin_unpublished_generations(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 30
)
returns table (
  id uuid,
  created_at timestamptz,
  generation_completed_at timestamptz,
  prompt_text text,
  model text,
  aspect_ratio text,
  image_size text,
  result_storage_bucket text,
  result_storage_path text,
  ugc_card_id uuid,
  card_exists boolean,
  is_published boolean,
  source_channel text
)
language sql
stable
as $$
  select
    q.id,
    q.created_at,
    q.generation_completed_at,
    q.prompt_text,
    q.model,
    q.aspect_ratio,
    q.image_size,
    q.result_storage_bucket,
    q.result_storage_path,
    q.ugc_card_id,
    q.card_exists,
    q.is_published,
    q.source_channel
  from public.admin_generations_queue(
    'unpublished',
    p_cursor_created_at,
    p_cursor_id,
    p_limit
  ) q;
$$;
