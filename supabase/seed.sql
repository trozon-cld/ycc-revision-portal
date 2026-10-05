-- Only Superadmin is seeded here; Superadmin creates Admins and Admins
-- create Candidates via the UI. To rotate the password, regenerate the
-- hash (npm run hash -- "password") and re-run this file.

insert into users (email, password_hash, role, access_start_at, access_expires_at, is_blocked)
values ('REPLACE_WITH_EMAIL', 'REPLACE_WITH_BCRYPT_HASH', 'superadmin', null, null, false)
on conflict (email) do update set password_hash = excluded.password_hash;

-- Placeholder category groups and categories, renameable by the Superadmin.
insert into category_groups (position, name)
select position, name
from (values (1, 'General'), (2, 'Special')) as seed (position, name)
where not exists (select 1 from category_groups);

insert into categories (name, group_id)
select name, (select id from category_groups order by position limit 1)
from (values
  ('General Operative'),
  ('Skilled Trade'),
  ('Supervisor'),
  ('Site Manager'),
  ('Specialist Role')
) as seed (name)
on conflict ((lower(name))) do nothing;

-- Placeholder sections and chapters, all renameable. Each only seeds an empty table.
insert into sections (position, title)
select position, title
from (values
  (1, 'Working environment'),
  (2, 'Occupational health'),
  (3, 'Safety'),
  (4, 'High risk activities'),
  (5, 'Specialist activities')
) as seed (position, title)
where not exists (select 1 from sections);

insert into chapters (section_id, position, title)
select s.id, seed.position, seed.title
from (values
  (1, 1, 'General responsibilities'),
  (1, 2, 'Accident reporting and recording'),
  (1, 3, 'First aid and emergency procedures'),
  (1, 4, 'Personal protective equipment'),
  (1, 5, 'Environmental awareness and waste control'),
  (2, 1, 'Dust and fumes (respiratory hazards)'),
  (2, 2, 'Noise and vibration'),
  (2, 3, 'Health and welfare'),
  (2, 4, 'Manual handling'),
  (3, 1, 'Safety signs'),
  (3, 2, 'Fire prevention and control'),
  (3, 3, 'Electrical safety, tools and equipment'),
  (4, 1, 'Site transport and lifting operations'),
  (4, 2, 'Working at height'),
  (4, 3, 'Excavations and confined spaces'),
  (4, 4, 'Hazardous substances')
) as seed (section_position, position, title)
join sections s on s.position = seed.section_position
where not exists (select 1 from chapters);
