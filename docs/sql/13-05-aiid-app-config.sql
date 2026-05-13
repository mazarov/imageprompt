-- Config table for the extension-lite (AI Image Describer) project.
-- Mirrors the structure of photo_app_config: simple key/value store.
-- All runtime tunables for /api/extension/* routes live here.

create table if not exists public.aiid_app_config (
  key    text primary key,
  value  text not null
);

comment on table public.aiid_app_config is
  'Runtime config for the AI Image Describer extension (extension-lite). Key/value pairs read by /api/extension/* routes. Edit rows to change behaviour without a code deploy.';

-- Seed: only keys actually read by /api/extension/* routes ------------------
-- ON CONFLICT DO NOTHING — safe to re-run; existing overrides are preserved.

-- Route Gemini calls through GEMINI_PROXY_BASE_URL env var (true) or call
-- generativelanguage.googleapis.com directly (false).
insert into public.aiid_app_config (key, value)
values ('gemini_use_proxy', 'true')
on conflict (key) do nothing;

-- Maximum number of analyze requests allowed per IP per calendar day (UTC).
-- Matches the code-level fallback RATE_LIMIT_PER_DAY_DEFAULT = 30.
insert into public.aiid_app_config (key, value)
values ('extension_rate_limit_per_day', '30')
on conflict (key) do nothing;
