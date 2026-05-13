-- Config table for the extension-lite (AI Image Describer) project.
-- Mirrors the structure of photo_app_config: simple key/value store.
-- All runtime tunables for /api/extension/* routes live here.

create table if not exists public.aiid_app_config (
  key    text primary key,
  value  text not null
);

comment on table public.aiid_app_config is
  'Runtime config for the AI Image Describer extension (extension-lite). Key/value pairs read by /api/extension/* routes. Edit rows to change behaviour without a code deploy.';

-- Seed: all keys from photo_app_config + extension-specific keys -------------
-- ON CONFLICT DO NOTHING — safe to re-run; existing overrides are preserved.

-- Gemini proxy flag (same as photo_app_config.gemini_use_proxy).
-- true  = route Gemini calls through GEMINI_PROXY_BASE_URL env var.
-- false = call generativelanguage.googleapis.com directly.
insert into public.aiid_app_config (key, value)
values ('gemini_use_proxy', 'true')
on conflict (key) do nothing;

-- Gemini model used in /api/vibe/extract (vision → style JSON).
-- Default: gemini-2.5-pro (DEFAULT_GEMINI_VIBE_EXTRACT_MODEL in code).
insert into public.aiid_app_config (key, value)
values ('vibe_extract_model', 'gemini-2.5-pro')
on conflict (key) do nothing;

-- Gemini model used in /api/vibe/expand (text → scene prompt JSON).
-- Default: gemini-2.5-flash (DEFAULT_GEMINI_VIBE_EXPAND_MODEL in code).
insert into public.aiid_app_config (key, value)
values ('vibe_expand_model', 'gemini-2.5-flash')
on conflict (key) do nothing;

-- LLM backend for /api/vibe/extract: 'gemini' | 'openai'. Default: gemini.
insert into public.aiid_app_config (key, value)
values ('vibe_extract_llm', 'gemini')
on conflict (key) do nothing;

-- LLM backend for /api/vibe/expand: 'gemini' | 'openai'. Default: gemini.
insert into public.aiid_app_config (key, value)
values ('vibe_expand_llm', 'gemini')
on conflict (key) do nothing;

-- OpenAI model for extract when vibe_extract_llm = openai.
-- Default: gpt-4o (DEFAULT_OPENAI_VIBE_EXTRACT_MODEL in code).
insert into public.aiid_app_config (key, value)
values ('vibe_openai_extract_model', 'gpt-4o')
on conflict (key) do nothing;

-- OpenAI model for expand when vibe_expand_llm = openai.
-- Default: gpt-4.1-mini (DEFAULT_OPENAI_VIBE_EXPAND_MODEL in code).
insert into public.aiid_app_config (key, value)
values ('vibe_openai_expand_model', 'gpt-4.1-mini')
on conflict (key) do nothing;

-- Whether to attach the reference image to the generation call.
-- Default: true (PHOTO_APP_CONFIG_KEY_VIBE_ATTACH_REFERENCE in code).
insert into public.aiid_app_config (key, value)
values ('vibe_attach_reference_image_to_generation', 'true')
on conflict (key) do nothing;

-- Historical flag: always use legacy 9-field prompt chain (value: legacy_2c23ce94).
insert into public.aiid_app_config (key, value)
values ('vibe_legacy_prompt_chain_2c23ce94', 'legacy_2c23')
on conflict (key) do nothing;

-- ── Extension-lite specific ──────────────────────────────────────────────────

-- Maximum number of analyze requests allowed per IP per calendar day (UTC).
-- Matches the code-level fallback RATE_LIMIT_PER_DAY_DEFAULT = 30.
insert into public.aiid_app_config (key, value)
values ('extension_rate_limit_per_day', '30')
on conflict (key) do nothing;
