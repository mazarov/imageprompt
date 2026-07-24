-- Admin generation queue: completed admin generations not yet published.
-- Apply in Supabase SQL Editor before deploying GET /api/admin/generations.

create index if not exists landing_generations_admin_queue_idx
  on public.landing_generations (created_at desc, id desc)
  where client_source = 'admin' and status = 'completed';

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
    c.source_channel
  from public.landing_generations g
  left join public.prompt_cards c on c.id = g.ugc_card_id
  where g.client_source = 'admin'
    and g.status = 'completed'
    and (
      g.ugc_card_id is null
      or c.id is null
      or c.is_published = false
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

revoke all on function public.admin_unpublished_generations(timestamptz, uuid, integer) from public;
grant execute on function public.admin_unpublished_generations(timestamptz, uuid, integer) to service_role;

comment on function public.admin_unpublished_generations is
  'Returns admin completed generations whose prompt_cards row is missing or is_published=false.';
