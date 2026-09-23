-- Delta for a DB that already has schema.sql v1 applied (not a full re-run).

create table categories (
  id uuid primary key default gen_random_uuid(),
  name varchar not null unique,
  created_at timestamptz not null default now()
);

alter table users
  add column category_id uuid references categories (id);

-- Placeholders so the Candidate-creation form has real options — rename
-- freely, category management isn't built yet.
insert into categories (name) values
  ('General Operative'),
  ('Skilled Trade'),
  ('Supervisor'),
  ('Site Manager'),
  ('Specialist Role')
on conflict (name) do nothing;
