-- Repoint landing_generations.user_id FK to imageprompt_users (app JWT sub).
--
-- Symptom: POST /api/admin/generate (and possibly POST /api/generate for new OAuth users)
-- fails with:
--   insert or update on table "landing_generations" violates foreign key constraint
--   "landing_generations_user_id_fkey"
-- even when a matching landing_users row exists.
--
-- Typical cause: landing_generations.user_id still references auth.users (GoTrue) while
-- sessions use imageprompt_users.id from docs/sql/03-04-imageprompt-users.sql.
-- Same class of bug as vibes — see docs/sql/03-06-vibes-user-id-fk-imageprompt-users.sql.
--
-- Apply after 03-04 (and usually after 03-05 landing_users → imageprompt_users).

-- Preview current FK target:
-- SELECT
--   c.conname,
--   pg_get_constraintdef(c.oid) AS def
-- FROM pg_constraint c
-- JOIN pg_class t ON t.oid = c.conrelid
-- WHERE t.relname = 'landing_generations'
--   AND c.contype = 'f'
--   AND c.conname = 'landing_generations_user_id_fkey';

-- Preview: generations whose user_id has no imageprompt_users row (would block new FK)
-- SELECT g.id, g.user_id, g.created_at, g.status
-- FROM public.landing_generations g
-- WHERE NOT EXISTS (SELECT 1 FROM public.imageprompt_users i WHERE i.id = g.user_id);

-- Optional: remove orphans before altering FK (uncomment only if ALTER fails)
-- DELETE FROM public.landing_generations g
-- WHERE NOT EXISTS (SELECT 1 FROM public.imageprompt_users i WHERE i.id = g.user_id);

ALTER TABLE public.landing_generations
  DROP CONSTRAINT IF EXISTS landing_generations_user_id_fkey;

ALTER TABLE public.landing_generations
  ADD CONSTRAINT landing_generations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.imageprompt_users (id) ON DELETE CASCADE
  NOT VALID;

COMMENT ON CONSTRAINT landing_generations_user_id_fkey ON public.landing_generations IS
  'App user id: must exist in imageprompt_users (Google OAuth / extension JWT). Added NOT VALID to preserve legacy GoTrue rows.';

-- New writes are checked immediately. Validate later, after legacy orphan rows are reconciled:
-- ALTER TABLE public.landing_generations
--   VALIDATE CONSTRAINT landing_generations_user_id_fkey;
