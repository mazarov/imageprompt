-- App auth without Supabase GoTrue: canonical users + extension OAuth exchange.
--
-- Apply: Supabase Dashboard → SQL → New query → paste → Run.
-- RLS: leave disabled for these tables if the app uses service role only (same as other landing API tables).

-- 1) Canonical user linked to Google (sub)
CREATE TABLE IF NOT EXISTS public.imageprompt_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub text NOT NULL,
  email text,
  email_verified boolean,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS imageprompt_users_google_sub_key
  ON public.imageprompt_users (google_sub);

CREATE INDEX IF NOT EXISTS imageprompt_users_email_lower_idx
  ON public.imageprompt_users (lower(email))
  WHERE email IS NOT NULL;

COMMENT ON TABLE public.imageprompt_users IS 'ImagePrompt app users; landing_users.id should equal imageprompt_users.id for credits/RPC.';

-- 2) One-time exchange codes for Chrome extension OAuth completion (plaintext never stored)
CREATE TABLE IF NOT EXISTS public.oauth_extension_exchange (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.imageprompt_users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS oauth_extension_exchange_token_hash_key
  ON public.oauth_extension_exchange (token_hash)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS oauth_extension_exchange_expires_idx
  ON public.oauth_extension_exchange (expires_at)
  WHERE consumed_at IS NULL;

COMMENT ON TABLE public.oauth_extension_exchange IS 'Single-use hashed tokens; extension swaps for app JWT via POST /api/auth/extension/exchange.';

-- 3) Next: if landing_users.id still references auth.users, run docs/sql/03-05-landing-users-fk-imageprompt-users.sql
