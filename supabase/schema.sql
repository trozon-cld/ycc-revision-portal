-- Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create type role_type as enum ('superadmin', 'admin', 'candidate');

-- Candidates can switch only between categories of the same group. Managed by the Superadmin.
create table category_groups (
  id uuid primary key default gen_random_uuid(),
  position integer not null check (position > 0),
  name varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_groups_position_key unique (position) deferrable initially deferred
);

create unique index category_groups_name_key on category_groups (lower(name));

-- A Candidate's assignment (e.g. Operative).
create table categories (
  id uuid primary key default gen_random_uuid(),
  name varchar not null unique,
  group_id uuid not null references category_groups (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index categories_group_idx on categories (group_id);

create table users (
  id uuid primary key default gen_random_uuid(),
  email varchar not null unique,
  password_hash varchar not null,
  role role_type not null,
  -- Candidates only (required for them, see check below). NULL for Admins/Superadmins.
  category_id uuid references categories (id),
  -- Candidates only: their own choice, always in the same group as category_id (see trigger below).
  current_category_id uuid references categories (id),
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
  ),
  constraint users_current_category_check check ((role = 'candidate') = (current_category_id is not null))
);

create index users_admin_id_idx on users (admin_id);
create index users_current_category_idx on users (current_category_id);

create function check_candidate_category_group() returns trigger
language plpgsql as $$
begin
  if new.role = 'candidate' and new.current_category_id is not null
     and (select group_id from categories where id = new.category_id)
         is distinct from (select group_id from categories where id = new.current_category_id) then
    raise exception 'A candidate''s current category must be in the same group as their assigned category'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger users_category_group_check
  before insert or update of category_id, current_category_id on users
  for each row execute function check_candidate_category_group();

-- Moving a category to another group would silently move its candidates too, so it's refused.
create function check_category_group_move() returns trigger
language plpgsql as $$
begin
  if new.group_id is distinct from old.group_id
     and exists (select 1 from users where category_id = new.id or current_category_id = new.id) then
    raise exception 'A category in use by candidates cannot move to another group'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger categories_group_move_check
  before update of group_id on categories
  for each row execute function check_category_group_move();

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

create table media (
  id uuid primary key default gen_random_uuid(),
  -- Paths inside the private storage bucket. The thumbnail is a small copy for grids and pickers.
  storage_path varchar not null unique,
  thumb_path varchar not null unique,
  original_name varchar(255) not null,
  mime_type varchar not null check (mime_type in ('image/webp', 'image/png', 'image/jpeg')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size integer not null check (byte_size > 0),
  -- Required: read by screen readers, and later by Listen.
  alt_text varchar(300) not null check (length(trim(alt_text)) > 0),
  uploaded_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_created_at_idx on media (created_at desc);

create table content_pages (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters (id) on delete restrict,
  -- Admin-only label; candidates see only the blocks.
  title varchar(120) not null check (length(trim(title)) > 0),
  -- Ordered block list, validated by lib/content/blocks.ts before every save.
  blocks jsonb not null default '[]' check (jsonb_typeof(blocks) = 'array'),
  -- Goes up whenever the blocks change: guards against overwriting and marks audio stale later.
  content_version integer not null default 1 check (content_version > 0),
  status content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_pages_chapter_idx on content_pages (chapter_id);

-- The book order within each chapter. Questions will join this list later.
create table handbook_items (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters (id) on delete restrict,
  position integer not null check (position > 0),
  content_page_id uuid not null unique references content_pages (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint handbook_items_chapter_position_key unique (chapter_id, position) deferrable initially deferred
);

-- Pictures used by each page, rewritten on every save, so a picture in use cannot be deleted.
create table content_page_media (
  content_page_id uuid not null references content_pages (id) on delete cascade,
  media_id uuid not null references media (id) on delete restrict,
  primary key (content_page_id, media_id)
);

create index content_page_media_media_idx on content_page_media (media_id);
