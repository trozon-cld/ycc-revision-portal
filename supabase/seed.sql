-- YCC Revision Portal — Day 1 seed
-- Seeds the one hard-coded account: the initial Superadmin.
-- Superadmin creates Admins, and Admins create Candidates, both via the
-- product UI — so this is the only account seeded directly in SQL.

-- 1. Generate a bcrypt hash for your chosen password:
--      npm run hash -- "YourStrongPassword"
-- 2. Paste the output below in place of REPLACE_WITH_BCRYPT_HASH.
-- 3. Set your real email in place of REPLACE_WITH_EMAIL.
-- 4. Run this file in the Supabase SQL editor.
--
-- Re-runnable: re-run any time to rotate the password (update the hash and
-- run again — it updates the existing row instead of erroring).

insert into users (email, password_hash, role, access_start_at, access_expires_at, is_blocked)
values ('REPLACE_WITH_EMAIL', 'REPLACE_WITH_BCRYPT_HASH', 'superadmin', null, null, false)
on conflict (email) do update set password_hash = excluded.password_hash;

-- Placeholder categories, so the Candidate-creation form has real options
-- to assign. Rename/replace/add to these freely — category management
-- (Admin creating categories via UI) isn't built yet, this is just seed
-- data to unblock testing.
insert into categories (name) values
  ('General Operative'),
  ('Skilled Trade'),
  ('Supervisor'),
  ('Site Manager'),
  ('Specialist Role')
on conflict (name) do nothing;
