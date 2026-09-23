-- Only Superadmin is seeded here; Superadmin creates Admins and Admins
-- create Candidates via the UI. To rotate the password, regenerate the
-- hash (npm run hash -- "password") and re-run this file.

insert into users (email, password_hash, role, access_start_at, access_expires_at, is_blocked)
values ('REPLACE_WITH_EMAIL', 'REPLACE_WITH_BCRYPT_HASH', 'superadmin', null, null, false)
on conflict (email) do update set password_hash = excluded.password_hash;

-- Placeholders so the Candidate-creation form has real options — rename
-- freely, category management isn't built yet.
insert into categories (name) values
  ('General Operative'),
  ('Skilled Trade'),
  ('Supervisor'),
  ('Site Manager'),
  ('Specialist Role')
on conflict (name) do nothing;
