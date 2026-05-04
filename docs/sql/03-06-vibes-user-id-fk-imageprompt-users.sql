-- Repoint vibes.user_id FK to imageprompt_users (app JWT sub).
--
-- Symptom: POST /api/vibe/extract runs Gemini OK, then fails with:
--   insert or update on table "vibes" violates foreign key constraint "vibes_user_id_fkey"
-- Typical cause: vibes.user_id still references auth.users (GoTrue) while sessions use
-- imageprompt_users.id from docs/sql/03-04-imageprompt-users.sql.
--
-- Apply after 03-04 (and usually after 03-05 landing_users → imageprompt_users).

-- Preview: vibes rows whose user_id has no imageprompt_users row (would block new FK)
-- SELECT v.id, v.user_id, v.created_at
-- FROM public.vibes v
-- WHERE NOT EXISTS (SELECT 1 FROM public.imageprompt_users i WHERE i.id = v.user_id);

-- Optional: remove orphans before altering FK (uncomment only if ALTER fails)
-- DELETE FROM public.vibes v
-- WHERE NOT EXISTS (SELECT 1 FROM public.imageprompt_users i WHERE i.id = v.user_id);

ALTER TABLE public.vibes
  DROP CONSTRAINT IF EXISTS vibes_user_id_fkey;

ALTER TABLE public.vibes
  ADD CONSTRAINT vibes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.imageprompt_users (id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT vibes_user_id_fkey ON public.vibes IS
  'App user id: must exist in imageprompt_users (Google OAuth / extension JWT).';

-- Troubleshooting after this migration:
--
-- ERROR: Key (user_id)=(...) is not present in table "imageprompt_users"
--   The JWT still carries an id that has no row (old token, row deleted, or app pointed at wrong DB).
--   Fix for users: sign out and complete Google login again in the extension / site.
--   Fix in DB (only if you intentionally need this uuid): INSERT into imageprompt_users with a real
--   google_sub (never invent empty rows — use OAuth upsert flow instead).
