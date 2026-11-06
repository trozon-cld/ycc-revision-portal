-- 0044: database backups. Each row is one backup file in the private db-backups bucket (daily and weekly ones made by
-- the schedule, manual ones by the Superadmin); the file holds every table, but no pictures or audio.

begin;

create table database_backups (
  id uuid primary key default gen_random_uuid(),
  kind varchar(10) not null check (kind in ('daily', 'weekly', 'manual')),
  -- Path inside the private storage bucket.
  file_path varchar not null unique,
  byte_size integer not null check (byte_size > 0),
  -- The newest migration the database had when the backup was made (restore needs a schema.sql at that version).
  migration varchar(100) not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index database_backups_created_at_idx on database_backups (created_at desc);

insert into schema_migrations (name) values ('0044_database_backups');

commit;
