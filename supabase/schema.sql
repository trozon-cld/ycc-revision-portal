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
  name varchar not null,
  group_id uuid not null references category_groups (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index categories_name_key on categories (lower(name));
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
  -- these NULL and bypass the checks (see lib/auth/guard.ts).
  access_start_at timestamptz,
  access_expires_at timestamptz,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  -- Chosen with A−/A+ in the reader; one setting per person, on every device. Empty = 16 px.
  reader_text_size smallint check (reader_text_size in (14, 16, 18, 20, 22, 24)),
  -- Display name. Required when admins and candidates are created in the app; older users may have none.
  full_name varchar(100) check (full_name is null or length(trim(full_name)) > 0),
  -- Goes up when the password changes; sign-ins carrying an older number are signed out.
  session_version integer not null default 1 check (session_version > 0),
  constraint users_candidate_fields_check check (
    (role = 'candidate' and category_id is not null and admin_id is not null)
    or (role <> 'candidate' and admin_id is null)
  ),
  constraint users_current_category_check check ((role = 'candidate') = (current_category_id is not null))
);

create index users_admin_id_idx on users (admin_id);
create index users_category_idx on users (category_id);
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
-- An admin's Activity page: their candidates' category switches.
create index activity_logs_switch_target_idx on activity_logs (target_id, created_at desc)
  where action = 'candidate.category_switched';

create table auth_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event varchar not null check (event in ('login_success', 'login_failed', 'logout', 'login_paused')),
  user_id uuid,
  email varchar not null,
  role role_type,
  ip_address varchar
);

create index auth_events_created_at_idx on auth_events (created_at desc);
create index auth_events_user_idx on auth_events (user_id, created_at desc);
-- Rate limiting counts recent failed logins per email and per address.
create index auth_events_failed_email_idx on auth_events (email, created_at desc) where event = 'login_failed';
create index auth_events_failed_ip_idx on auth_events (ip_address, created_at desc) where event = 'login_failed';

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

-- One row per archived month (UK time) and log. Kept forever, like the logs themselves.
create table log_archives (
  id uuid primary key default gen_random_uuid(),
  log varchar not null check (log in ('login_records')),
  month date not null check (extract(day from month) = 1),
  record_count integer not null check (record_count >= 0),
  -- Path inside the private storage bucket.
  file_path varchar not null unique,
  byte_size integer not null check (byte_size > 0),
  archived_by uuid references users (id) on delete set null,
  archived_by_email varchar not null,
  created_at timestamptz not null default now(),
  constraint log_archives_log_month_key unique (log, month)
);

create trigger log_archives_read_only
  before update or delete on log_archives
  for each row execute function prevent_log_changes();

-- Login records stay read-only, except deleting ones whose month has already been archived.
create function guard_auth_events() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and exists (
    select 1 from log_archives
    where log = 'login_records'
      and month = date_trunc('month', old.created_at at time zone 'Europe/London')::date
  ) then
    return old;
  end if;
  raise exception 'Log entries are read-only';
end;
$$;

create trigger auth_events_read_only
  before update or delete on auth_events
  for each row execute function guard_auth_events();

-- Shared by chapters, content pages and questions.
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
create index media_uploaded_by_idx on media (uploaded_by);

-- Optional Handbook cover pictures per category (declared here because media comes after categories).
alter table categories
  add column front_cover_media_id uuid references media (id) on delete restrict,
  add column back_cover_media_id uuid references media (id) on delete restrict;

create index categories_front_cover_idx on categories (front_cover_media_id);
create index categories_back_cover_idx on categories (back_cover_media_id);

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

create table questions (
  id uuid primary key default gen_random_uuid(),
  -- Shown to admins as "Q0042". Never reused, even after a delete.
  ref_no integer generated always as identity unique,
  chapter_id uuid not null references chapters (id) on delete restrict,
  -- Keys match lib/questions/registry.ts. The app offers a type only once it is built.
  type varchar(30) not null check (type in ('single_text', 'single_picture', 'multi_pick', 'hotspot', 'area_choice', 'match_pictures')),
  status content_status not null default 'draft',
  stem_text varchar(1000) not null check (length(trim(stem_text)) > 0),
  -- Optional picture for any type.
  stem_media_id uuid references media (id) on delete restrict,
  -- Type-specific shapes, validated by lib/questions before every save. The answer is kept
  -- apart so practice and exam can send the question without it.
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  answer jsonb not null check (jsonb_typeof(answer) = 'object'),
  explanation varchar(2000) check (explanation is null or length(trim(explanation)) > 0),
  in_practice boolean not null default true,
  in_mock boolean not null default true,
  content_version integer not null default 1 check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Empty = full width, centred (how every existing question looks). Position only applies below full width.
  stem_media_size varchar(10) check (stem_media_size in ('small', 'medium', 'large')),
  stem_media_align varchar(10) check (stem_media_align in ('left', 'right')),
  constraint questions_stem_media_layout_check check (
    (stem_media_id is not null or (stem_media_size is null and stem_media_align is null))
    and (stem_media_align is null or stem_media_size is not null)
  )
);

create index questions_chapter_idx on questions (chapter_id);
create index questions_stem_media_idx on questions (stem_media_id);

-- Every picture a question uses, rewritten on every save, so a picture in use cannot be deleted.
create table question_media (
  question_id uuid not null references questions (id) on delete cascade,
  media_id uuid not null references media (id) on delete restrict,
  primary key (question_id, media_id)
);

create index question_media_media_idx on question_media (media_id);

-- The book order within each chapter. An item is exactly one content page or one question;
-- a question in the book can't be deleted.
create table handbook_items (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters (id) on delete restrict,
  position integer not null check (position > 0),
  content_page_id uuid unique references content_pages (id) on delete cascade,
  created_at timestamptz not null default now(),
  question_id uuid unique references questions (id) on delete restrict,
  constraint handbook_items_chapter_position_key unique (chapter_id, position) deferrable initially deferred,
  constraint handbook_items_one_kind_check check (num_nonnulls(content_page_id, question_id) = 1)
);

-- Pictures used by each page, rewritten on every save, so a picture in use cannot be deleted.
create table content_page_media (
  content_page_id uuid not null references content_pages (id) on delete cascade,
  media_id uuid not null references media (id) on delete restrict,
  primary key (content_page_id, media_id)
);

create index content_page_media_media_idx on content_page_media (media_id);

-- Where each candidate last was in each category's book. A deleted page just resets it to the start.
create table handbook_progress (
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  item_id uuid references handbook_items (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

create index handbook_progress_category_idx on handbook_progress (category_id);
create index handbook_progress_item_idx on handbook_progress (item_id);

-- Handbook items done, one row per chapter: a content page once its last part was on screen, a
-- question once Check or Reveal was used. Ids of deleted items drop out on the chapter's next save.
create table handbook_chapter_progress (
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  done_items uuid[] not null default '{}' check (cardinality(done_items) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id, chapter_id)
);

create index handbook_chapter_progress_category_idx on handbook_chapter_progress (category_id);
create index handbook_chapter_progress_chapter_idx on handbook_chapter_progress (chapter_id);

-- One row per candidate, category and question; counters stop at the smallint limit.
-- A Reveal before any try counts as not right first time. Practice columns are filled from E4a-2.
create table question_results (
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  handbook_tries smallint not null default 0,
  handbook_right smallint not null default 0,
  handbook_reveals smallint not null default 0,
  handbook_first_right boolean,
  handbook_last_right boolean,
  handbook_at timestamptz,
  practice_tries smallint not null default 0,
  practice_right smallint not null default 0,
  practice_first_right boolean,
  practice_last_right boolean,
  practice_at timestamptz,
  primary key (user_id, category_id, question_id),
  constraint question_results_counts_check check (
    handbook_tries >= 0 and handbook_reveals >= 0 and practice_tries >= 0
    and handbook_right between 0 and handbook_tries
    and practice_right between 0 and practice_tries
  )
);

create index question_results_category_idx on question_results (category_id);
create index question_results_question_idx on question_results (question_id);

-- results: one letter per question in order: '.' not answered yet, R right, W wrong, S skipped
-- (removed since the start). The latest finished run keeps question_ids/results; older ones only totals.
create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  mode varchar(10) not null check (mode in ('smart', 'chapters', 'types', 'all', 'retry', 'wrong', 'flagged', 'unseen', 'weak')),
  -- Chapter ids or question types chosen (weak: the weak chapters at the start); empty otherwise.
  choices text[] not null default '{}' check (cardinality(choices) <= 200),
  question_ids uuid[] check (cardinality(question_ids) between 1 and 2000),
  results text check (results ~ '^[.RWS]*$'),
  position smallint not null default 0 check (position >= 0),
  total smallint not null check (total > 0),
  answered smallint not null default 0 check (answered >= 0),
  right_count smallint not null default 0 check (right_count between 0 and answered),
  -- Right and answered per chapter, kept when the question list is trimmed: {"chapterId": [right, answered]}.
  chapter_summary jsonb,
  -- Time spent answering, not counting breaks longer than 5 minutes.
  seconds_spent integer not null default 0 check (seconds_spent >= 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint practice_sessions_list_check check (
    (question_ids is null) = (results is null)
    and (question_ids is null or length(results) = cardinality(question_ids))
    and (finished_at is not null or question_ids is not null)
  )
);

-- One practice in progress per candidate.
create unique index practice_sessions_open_key on practice_sessions (user_id) where finished_at is null;
create index practice_sessions_user_idx on practice_sessions (user_id, finished_at desc);
create index practice_sessions_category_idx on practice_sessions (category_id);

-- A candidate's own bookmark on a question, set in Practice or its report. Not activity-log data.
create table question_flags (
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, category_id, question_id)
);

create index question_flags_category_idx on question_flags (category_id);
create index question_flags_question_idx on question_flags (question_id);
