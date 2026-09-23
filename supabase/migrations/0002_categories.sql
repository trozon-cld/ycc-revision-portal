-- YCC Revision Portal — adds `categories`
-- Run this in the Supabase SQL editor (your DB already has schema.sql v1
-- applied, so this is the delta, not a full re-run).
--
-- A Candidate is scoped to one category at credential creation (e.g.
-- Operative, Supervisor). Admins/Superadmins have no category — NULL.
-- Distinct from the topics/questions stub tables, which are reserved for
-- the actual Prepare/Practice/Mock Test content *within* a category, a
-- later feature — not the same thing as categories.

create table categories (
  id uuid primary key default gen_random_uuid(),
  name varchar not null unique,
  created_at timestamptz not null default now()
);

alter table users
  add column category_id uuid references categories (id);

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
