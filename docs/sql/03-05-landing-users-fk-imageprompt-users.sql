-- Repoint landing_users.id FK from auth.users (GoTrue) to imageprompt_users (app Google auth).
--
-- Apply in Supabase SQL Editor after:
--   docs/sql/03-04-imageprompt-users.sql
--
-- Removes legacy GoTrue-era rows: landing_users (and dependent billing rows) whose id
-- has no matching imageprompt_users row, then adds FK to imageprompt_users.

-- Preview: other tables referencing landing_users (add more DELETE steps if needed)
-- SELECT c.conname, c.conrelid::regclass AS referencing_table
-- FROM pg_constraint c
-- WHERE c.confrelid = 'public.landing_users'::regclass AND c.contype = 'f';

-- Orphan landing_users ids (no row in imageprompt_users)
-- WITH orphans AS (
--   SELECT lu.id FROM public.landing_users lu
--   WHERE NOT EXISTS (SELECT 1 FROM public.imageprompt_users i WHERE i.id = lu.id)
-- )
-- SELECT * FROM orphans;

-- 1) Remove dependent rows first (billing / web checkout → landing_users)
DELETE FROM public.landing_web_transactions t
WHERE t.landing_user_id IN (
  SELECT lu.id
  FROM public.landing_users lu
  WHERE NOT EXISTS (
    SELECT 1 FROM public.imageprompt_users i WHERE i.id = lu.id
  )
);

-- 2) Remove orphan landing_users rows
DELETE FROM public.landing_users lu
WHERE NOT EXISTS (
  SELECT 1 FROM public.imageprompt_users i WHERE i.id = lu.id
);

-- If step 2 still fails, find the blocking FK with the preview query above and DELETE/UPDATE there too.

-- 3) Replace FK target
ALTER TABLE public.landing_users
  DROP CONSTRAINT IF EXISTS landing_users_id_fkey;

ALTER TABLE public.landing_users
  ADD CONSTRAINT landing_users_id_fkey
  FOREIGN KEY (id) REFERENCES public.imageprompt_users (id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT landing_users_id_fkey ON public.landing_users IS
  'App user id: must exist in imageprompt_users (Google OAuth flow).';
