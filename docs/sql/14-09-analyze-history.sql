-- Admin analyze history: persisted image + prompt after successful /api/extension/analyze.
-- Apply in Supabase SQL Editor before deploying code that writes rows.
-- Private bucket "analyze-history" — also creatable in Dashboard (Storage → New bucket, public off).

create table if not exists public.analyze_history (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  client_source   text not null,
  image_path      text,
  image_mime      text,
  prompt          text not null,
  style           text,
  locale          text,
  model           text,
  user_id         uuid references public.imageprompt_users (id) on delete set null,
  ip_hash         text,
  correlation_id  text
);

create index if not exists analyze_history_created_at_idx
  on public.analyze_history (created_at desc);

create index if not exists analyze_history_client_source_idx
  on public.analyze_history (client_source, created_at desc);

comment on table public.analyze_history is
  'Successful analyze responses: thumbnail in storage bucket analyze-history + full prompt text. Retention 30 days (lazy admin cleanup or optional pg_cron below).';

-- Optional: create private storage bucket (idempotent).
insert into storage.buckets (id, name, public)
values ('analyze-history', 'analyze-history', false)
on conflict (id) do nothing;

-- Optional pg_cron (only if extension pg_cron is enabled in your Supabase project):
--   select cron.schedule(
--     'analyze_history_ttl_rows',
--     '0 3 * * *',
--     $$delete from public.analyze_history where created_at < now() - interval '30 days'$$
--   );
-- Storage objects are removed by GET /api/admin/analyze-history lazy cleanup (once per UTC day).
