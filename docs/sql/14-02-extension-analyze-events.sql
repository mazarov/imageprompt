-- Per-request fact table for the free analyze/remix flow
-- (extension-lite, promptshot widget, site widget).
-- Apply in Supabase SQL Editor before deploying code that inserts rows.
create table if not exists public.extension_analyze_events (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  endpoint      text not null,        -- 'analyze' | 'remix'
  client_source text,                 -- canonical enum: site | embed_stv | extension_stv | extension_lite | promptshot | unknown
  ip_hash       text,                 -- rate-limit bucket key (anon ip hash or 'user:<uuid>')
  user_id       uuid references public.imageprompt_users (id) on delete set null,
  allowed       boolean not null default true
);

create index if not exists extension_analyze_events_created_at_idx
  on public.extension_analyze_events (created_at);
create index if not exists extension_analyze_events_client_idx
  on public.extension_analyze_events (client_source);
create index if not exists extension_analyze_events_user_idx
  on public.extension_analyze_events (user_id);

comment on table public.extension_analyze_events is
  'Per-request analytics fact rows for the free analyze/remix API flow.';
