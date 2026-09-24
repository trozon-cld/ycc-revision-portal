-- Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create type role_type as enum ('superadmin', 'admin', 'candidate');

-- A Candidate's assignment (e.g. Operative).
create table categories (
  id uuid primary key default gen_random_uuid(),
  name varchar not null unique,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email varchar not null unique,
  password_hash varchar not null,
  role role_type not null,
  -- Candidates only (required for them, see check below). NULL for Admins/Superadmins.
  category_id uuid references categories (id),
  -- Admin who owns this candidate. Restrict: an Admin can't be deleted while owning candidates.
  admin_id uuid references users (id) on delete restrict,
  -- Expiry/block checks apply only to candidates. Admins/Superadmins keep
  -- these NULL and bypass the checks (see proxy.ts).
  access_start_at timestamptz,
  access_expires_at timestamptz,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  constraint users_candidate_fields_check check (
    (role = 'candidate' and category_id is not null and admin_id is not null)
    or (role <> 'candidate' and admin_id is null)
  )
);

create index users_admin_id_idx on users (admin_id);

create table login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  ip_address varchar,
  logged_in_at timestamptz not null default now()
);

-- No foreign keys: entries must outlive the users and categories they mention.
create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid not null,
  actor_email varchar not null,
  actor_role role_type not null,
  action varchar not null,
  target_type varchar not null,
  target_id uuid,
  target_label varchar not null,
  details jsonb not null default '{}',
  ip_address varchar
);

create index activity_logs_created_at_idx on activity_logs (created_at desc);
create index activity_logs_actor_idx on activity_logs (actor_id, created_at desc);

create table auth_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event varchar not null check (event in ('login_success', 'login_failed', 'logout')),
  user_id uuid,
  email varchar not null,
  role role_type,
  ip_address varchar
);

create index auth_events_created_at_idx on auth_events (created_at desc);
create index auth_events_user_idx on auth_events (user_id, created_at desc);

-- Logs are append-only. TRUNCATE (a deliberate DB-level reset) still works.
create function prevent_log_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'Log entries are read-only';
end;
$$;

create trigger activity_logs_read_only
  before update or delete on activity_logs
  for each row execute function prevent_log_changes();

create trigger auth_events_read_only
  before update or delete on auth_events
  for each row execute function prevent_log_changes();

-- Shared by chapters now, and by content pages and questions later.
create type content_status as enum ('draft', 'published');

create table sections (
  id uuid primary key default gen_random_uuid(),
  -- Display order; the letter (A, B, C…) is derived from it. Deferred so a reorder can swap.
  position integer not null check (position > 0),
  title varchar(120) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sections_position_key unique (position) deferrable initially deferred
);

create unique index sections_title_key on sections (lower(title));

create table chapters (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections (id) on delete restrict,
  -- Order within its section. The displayed number ("01", "02"…) is derived across the whole
  -- book. Deferred so a reorder can swap two positions.
  position integer not null check (position > 0),
  title varchar(120) not null,
  status content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chapters_section_position_key unique (section_id, position) deferrable initially deferred
);

create unique index chapters_title_key on chapters (lower(title));

-- No order column: chapters follow the Handbook order. Links are settings, so deletes cascade.
create table category_chapters (
  category_id uuid not null references categories (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (category_id, chapter_id)
);

create index category_chapters_chapter_idx on category_chapters (chapter_id);
