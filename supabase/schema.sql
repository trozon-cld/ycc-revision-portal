-- Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create type role_type as enum ('superadmin', 'admin', 'candidate');

-- Test areas (e.g. General, Specialist): candidates can switch only between test types of the same test area.
-- Managed by the Superadmin.
create table test_areas (
  id uuid primary key default gen_random_uuid(),
  position integer not null check (position > 0),
  name varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint test_areas_position_key unique (position) deferrable initially deferred
);

create unique index test_areas_name_key on test_areas (lower(name));

-- A test type (e.g. Operative): what a candidate is assigned and studies. Its book is its linked chapters.
create table test_types (
  id uuid primary key default gen_random_uuid(),
  name varchar not null,
  test_area_id uuid not null references test_areas (id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index test_types_name_key on test_types (lower(name));
create index test_types_test_area_idx on test_types (test_area_id);

create table users (
  id uuid primary key default gen_random_uuid(),
  email varchar not null unique,
  password_hash varchar not null,
  role role_type not null,
  -- Candidates only (required for them, see check below). NULL for Admins/Superadmins.
  test_type_id uuid references test_types (id),
  -- Candidates only: their own choice, always in the same test area as test_type_id (see trigger below).
  current_test_type_id uuid references test_types (id),
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
  -- Candidates: the language Listen reads Handbook pages in (voice_languages, added below). Staff: unused.
  preferred_language varchar(10) not null default 'en' check (preferred_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  constraint users_candidate_fields_check check (
    (role = 'candidate' and test_type_id is not null and admin_id is not null)
    or (role <> 'candidate' and admin_id is null)
  ),
  constraint users_current_test_type_check check ((role = 'candidate') = (current_test_type_id is not null))
);

create index users_admin_id_idx on users (admin_id);
create index users_test_type_idx on users (test_type_id);
create index users_current_test_type_idx on users (current_test_type_id);

create function check_candidate_test_area() returns trigger
language plpgsql as $$
begin
  if new.role = 'candidate' and new.current_test_type_id is not null
     and (select test_area_id from test_types where id = new.test_type_id)
         is distinct from (select test_area_id from test_types where id = new.current_test_type_id) then
    raise exception 'A candidate''s current test type must be in the same test area as their assigned test type'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger users_test_area_check
  before insert or update of test_type_id, current_test_type_id on users
  for each row execute function check_candidate_test_area();

-- Moving a test type to another test area would silently move its candidates too, so it's refused.
create function check_test_type_area_move() returns trigger
language plpgsql as $$
begin
  if new.test_area_id is distinct from old.test_area_id
     and exists (select 1 from users where test_type_id = new.id or current_test_type_id = new.id) then
    raise exception 'A test type in use by candidates cannot move to another test area'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger test_types_area_move_check
  before update of test_area_id on test_types
  for each row execute function check_test_type_area_move();

-- No foreign keys: entries must outlive the users and test types they mention.
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
-- An admin's Activity page: their candidates' test type switches (key renamed in 0037; older entries keep the old key).
create index activity_logs_switch_target_idx on activity_logs (target_id, created_at desc)
  where action in ('candidate.test_type_switched', 'candidate.category_switched');

create table auth_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event varchar not null check (event in ('login_success', 'login_failed', 'logout', 'login_paused', 'password_check_failed')),
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
create table test_type_chapters (
  test_type_id uuid not null references test_types (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (test_type_id, chapter_id)
);

create index test_type_chapters_chapter_idx on test_type_chapters (chapter_id);

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

-- Optional Handbook cover pictures per test type (declared here because media comes after test types).
alter table test_types
  add column front_cover_media_id uuid references media (id) on delete restrict,
  add column back_cover_media_id uuid references media (id) on delete restrict;

create index test_types_front_cover_idx on test_types (front_cover_media_id);
create index test_types_back_cover_idx on test_types (back_cover_media_id);

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

-- Where each candidate last was in each test type's book. A deleted page just resets it to the start.
create table handbook_progress (
  user_id uuid not null references users (id) on delete cascade,
  test_type_id uuid not null references test_types (id) on delete cascade,
  item_id uuid references handbook_items (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, test_type_id)
);

create index handbook_progress_test_type_idx on handbook_progress (test_type_id);
create index handbook_progress_item_idx on handbook_progress (item_id);

-- Handbook items done, one row per chapter: a content page once its last part was on screen, a
-- question once Check or Reveal was used. Ids of deleted items drop out on the chapter's next save.
create table handbook_chapter_progress (
  user_id uuid not null references users (id) on delete cascade,
  test_type_id uuid not null references test_types (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  done_items uuid[] not null default '{}' check (cardinality(done_items) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, test_type_id, chapter_id)
);

create index handbook_chapter_progress_test_type_idx on handbook_chapter_progress (test_type_id);
create index handbook_chapter_progress_chapter_idx on handbook_chapter_progress (chapter_id);

-- One row per candidate, test type and question; counters stop at the smallint limit.
-- A Reveal before any try counts as not right first time. Practice columns are filled from E4a-2.
create table question_results (
  user_id uuid not null references users (id) on delete cascade,
  test_type_id uuid not null references test_types (id) on delete cascade,
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
  primary key (user_id, test_type_id, question_id),
  constraint question_results_counts_check check (
    handbook_tries >= 0 and handbook_reveals >= 0 and practice_tries >= 0
    and handbook_right between 0 and handbook_tries
    and practice_right between 0 and practice_tries
  )
);

create index question_results_test_type_idx on question_results (test_type_id);
create index question_results_question_idx on question_results (question_id);

-- results: one letter per question in order: '.' not answered yet, R right, W wrong, S skipped
-- (removed since the start). The latest finished run keeps question_ids/results; older ones only totals.
create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  test_type_id uuid not null references test_types (id) on delete cascade,
  mode varchar(10) not null check (mode in ('smart', 'chapters', 'types', 'all', 'retry', 'wrong', 'flagged', 'unseen', 'weak', 'mock')),
  -- Chapter ids or question types chosen (weak: the weak chapters at the start; mock: the mock test); empty otherwise.
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
create index practice_sessions_test_type_idx on practice_sessions (test_type_id);

-- A candidate's own bookmark on a question, set in Practice or its report. Not activity-log data.
create table question_flags (
  user_id uuid not null references users (id) on delete cascade,
  test_type_id uuid not null references test_types (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, test_type_id, question_id)
);

create index question_flags_test_type_idx on question_flags (test_type_id);
create index question_flags_question_idx on question_flags (question_id);

-- While open: the drawn questions, the answers as given (marked at the end) and this test's own flags.
-- After it ends: marks and totals; the newest 10 per candidate keep their questions and answers for review.
create table mock_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  test_type_id uuid not null references test_types (id) on delete cascade,
  question_ids uuid[] check (cardinality(question_ids) between 1 and 50),
  -- One entry per question: the answer as given, or null.
  responses jsonb check (jsonb_typeof(responses) = 'array'),
  -- One letter per question: '.' or F (flagged for review in this test only).
  flags text check (flags ~ '^[.F]*$'),
  -- Set when it ends, one letter per question: R right, W wrong, U unanswered, S removed from the bank meanwhile.
  marks text check (marks ~ '^[RWUS]*$'),
  -- The question on screen, so a resumed test opens where it was left.
  position smallint not null default 0 check (position >= 0),
  total smallint not null check (total between 1 and 50),
  duration_seconds integer not null check (duration_seconds > 0),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  updated_at timestamptz not null default now(),
  -- submitted, time_up (ended at 0 on the test screen), away (time ran out while away),
  -- moved (the candidate's test type was changed by their Admin).
  ended_how varchar(10) check (ended_how in ('submitted', 'time_up', 'away', 'moved')),
  ended_at timestamptz,
  -- Totals, kept after the question list is trimmed. out_of leaves out removed questions.
  answered smallint check (answered >= 0),
  right_count smallint check (right_count between 0 and answered),
  out_of smallint check (out_of between 0 and total),
  seconds_taken integer check (seconds_taken >= 0),
  -- Right and out of, per chapter: {"chapterId": [right, outOf]}.
  chapter_summary jsonb,
  constraint mock_attempts_list_check check (
    (question_ids is null) = (responses is null) and (question_ids is null) = (flags is null)
    and (question_ids is null or (jsonb_array_length(responses) = total and length(flags) = total and cardinality(question_ids) = total))
    and (marks is null or (question_ids is not null and length(marks) = total))
  ),
  constraint mock_attempts_end_check check (
    (ended_at is null) = (ended_how is null)
    and (ended_at is not null or (question_ids is not null and marks is null))
    and (ended_at is null or (answered is not null and right_count is not null and out_of is not null and seconds_taken is not null))
  )
);

-- One mock test in progress per candidate.
create unique index mock_attempts_open_key on mock_attempts (user_id) where ended_at is null;
create index mock_attempts_user_idx on mock_attempts (user_id, ended_at desc);
create index mock_attempts_test_type_idx on mock_attempts (test_type_id);

-- General queries (FAQ) and support contact details, edited by the Superadmin.
create table faq_items (
  id uuid primary key default gen_random_uuid(),
  position integer not null check (position > 0),
  question varchar(200) not null check (btrim(question) <> ''),
  answer text not null check (btrim(answer) <> '' and char_length(answer) <= 3000),
  -- draft = hidden from candidates; published = shown.
  status varchar(10) not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faq_items_position_key unique (position) deferrable initially deferred
);

-- One row only. Every field is optional; candidates see only the ones filled in.
create table support_contact (
  id boolean primary key default true check (id),
  email varchar(255),
  phone varchar(40),
  hours varchar(120),
  note varchar(500),
  updated_at timestamptz not null default now()
);

insert into support_contact default values;

-- Listen (phase 2): translated Handbook pages, their audio, and voice service requests (hourly cap).
-- One translation per page and language: the English page's blocks with the text translated (same ids).
create table page_translations (
  content_page_id uuid not null references content_pages (id) on delete cascade,
  language varchar(10) not null check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$' and language <> 'en'),
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array'),
  -- The page's content_version this was translated from; differs once the English page changes.
  source_version integer not null check (source_version > 0),
  -- Goes up with every new or edited translation, so audio made from an older one shows as out of date.
  revision integer not null default 1 check (revision > 0),
  status varchar(10) not null default 'draft' check (status in ('draft', 'checked')),
  checked_by uuid references users (id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (content_page_id, language),
  check ((status = 'checked') = (checked_at is not null))
);

-- One audio file per page and language (MP3 in the private handbook-audio bucket).
create table page_audio (
  content_page_id uuid not null references content_pages (id) on delete cascade,
  language varchar(10) not null check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  -- English: the page's content_version; other languages: the translation's revision.
  source_version integer not null check (source_version > 0),
  storage_path varchar(300) not null unique,
  byte_size integer not null check (byte_size > 0),
  duration_ms integer not null check (duration_ms > 0),
  mime_type varchar(40) not null default 'audio/mpeg',
  provider varchar(80) not null,
  voice varchar(60) not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (content_page_id, language)
);

-- Voice service usage (0036): each staff member's hourly allowance in characters, and monthly totals per service.
-- One row per job: the characters reserved, then kept as the characters actually sent. Rows older than a day go as new ones come.
create table voice_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  kind varchar(12) not null check (kind in ('translate', 'speech')),
  service varchar(20) not null check (length(btrim(service)) > 0),
  characters integer not null check (characters >= 0),
  created_at timestamptz not null default now()
);

create index voice_usage_user_idx on voice_usage (user_id, kind, created_at);

-- Everyone's characters sent per service each month (UK time), to compare with what the provider bills. A few rows a month.
create table voice_usage_months (
  month date not null check (extract(day from month) = 1),
  kind varchar(12) not null check (kind in ('translate', 'speech')),
  service varchar(20) not null check (length(btrim(service)) > 0),
  characters bigint not null default 0 check (characters >= 0),
  primary key (month, kind, service)
);

-- Listen for Handbook question pages (V6a): translations of what is read aloud, and audio.
create table question_translations (
  question_id uuid not null references questions (id) on delete cascade,
  language varchar(10) not null check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$' and language <> 'en'),
  -- {"stem": "...", "options": [{"id": "...", "text": "..."}]} in the language, same option ids as the English.
  texts jsonb not null check (jsonb_typeof(texts) = 'object'),
  -- The English question text and options it was translated from.
  source jsonb not null check (jsonb_typeof(source) = 'object'),
  -- Goes up with every new or edited translation, so audio made from an older one shows as out of date.
  revision integer not null default 1 check (revision > 0),
  status varchar(10) not null default 'draft' check (status in ('draft', 'checked')),
  checked_by uuid references users (id) on delete set null,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (question_id, language),
  check ((status = 'checked') = (checked_at is not null))
);

-- One audio file per question and language (MP3 in the private handbook-audio bucket).
create table question_audio (
  question_id uuid not null references questions (id) on delete cascade,
  language varchar(10) not null check (language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  -- The English question text and options it was made from; other languages also the translation's revision.
  source jsonb not null check (jsonb_typeof(source) = 'object'),
  source_revision integer check (source_revision > 0),
  storage_path varchar(300) not null unique,
  byte_size integer not null check (byte_size > 0),
  duration_ms integer not null check (duration_ms > 0),
  mime_type varchar(40) not null default 'audio/mpeg',
  provider varchar(80) not null,
  voice varchar(60) not null,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (question_id, language),
  check ((language = 'en') = (source_revision is null))
);

-- Listen per test type (0032, 0035): off hides Listen and the listening language for its candidates; all offers every
-- live language (including ones added later); chosen offers English plus test_type_languages (added below).
alter table test_types add column listen_mode varchar(10) not null default 'all' check (listen_mode in ('off', 'all', 'chosen'));

-- Order within the test area (0038), shown everywhere test types are listed. Deferred so a reorder can swap two positions.
alter table test_types add column position integer not null check (position > 0);
alter table test_types add constraint test_types_area_position_key unique (test_area_id, position) deferrable initially deferred;

-- Listen's languages and their fixed spoken phrases (0033); managed in the app from L2.
-- One row per language. Only live languages are offered to candidates; staff can prepare draft ones; hidden ones
-- keep their translations and audio until the Superadmin deletes the language. English is the source and is always live.
create table voice_languages (
  code varchar(10) primary key check (code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  name varchar(60) not null check (length(btrim(name)) > 0),
  native_name varchar(60) not null check (length(btrim(native_name)) > 0),
  status varchar(10) not null default 'draft' check (status in ('draft', 'live', 'hidden')),
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (code <> 'en' or status = 'live')
);

-- The fixed wording Listen reads in each language (box labels, "Question", "Option", the question-type lines).
-- {n} stands for a number in "choose" and "choose_area" (English only, 0034). Checked once by staff (L2).
create table voice_phrases (
  language varchar(10) not null references voice_languages (code),
  phrase varchar(20) not null check (phrase in ('key_point', 'remember', 'question', 'option', 'choose', 'choose_area', 'tap_area', 'match_boxes', 'boxes_are')),
  text varchar(300) not null check (length(btrim(text)) > 0),
  status varchar(10) not null default 'draft' check (status in ('draft', 'checked')),
  checked_by uuid references users (id) on delete set null,
  checked_at timestamptz,
  updated_by uuid references users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (language, phrase),
  check ((status = 'checked') = (checked_at is not null)),
  check (phrase not in ('choose', 'choose_area') or position('{n}' in text) > 0),
  -- 0034: the counted phrases are English only; other languages translate that sentence with each question.
  constraint voice_phrases_counted_english_only check (language = 'en' or phrase not in ('choose', 'choose_area'))
);

-- A fresh database starts with English only; staff add the other languages on Languages and audio → Languages.
insert into voice_languages (code, name, native_name, status) values ('en', 'English', 'English', 'live');

insert into voice_phrases (language, phrase, text, status, checked_at)
select 'en', v.phrase, v.text, 'checked', now()
from (values
  ('key_point', 'Key point'),
  ('remember', 'Remember'),
  ('question', 'Question'),
  ('option', 'Option'),
  ('choose', 'Choose {n} answers'),
  ('choose_area', 'Choose one of the {n} outlined areas on the picture'),
  ('tap_area', 'Look at the picture and tap the place that answers the question'),
  ('match_boxes', 'Put each picture in the box it belongs to'),
  ('boxes_are', 'The boxes are:')
) as v (phrase, text);

-- Translations, audio and each candidate's listening language must name a known language.
alter table page_translations add foreign key (language) references voice_languages (code);
alter table page_audio add foreign key (language) references voice_languages (code);
alter table question_translations add foreign key (language) references voice_languages (code);
alter table question_audio add foreign key (language) references voice_languages (code);
alter table users add foreign key (preferred_language) references voice_languages (code);

-- The languages a test type offers when its listen_mode is 'chosen' (0035; kept when the mode changes). English is always offered.
create table test_type_languages (
  test_type_id uuid not null references test_types (id) on delete cascade,
  language varchar(10) not null references voice_languages (code) check (language <> 'en'),
  primary key (test_type_id, language)
);

-- Bulk upload keys (0039). A batch page or question keeps its key (e.g. AD-p012), so a re-upload updates it; a batch
-- picture keeps its file name and a fingerprint (SHA-256) of the file. Empty for anything made by hand.
alter table content_pages add column source_key varchar(40)
  constraint content_pages_source_key_check check (source_key ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$');
create unique index content_pages_source_key_key on content_pages (source_key);
alter table questions add column source_key varchar(40)
  constraint questions_source_key_check check (source_key ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$');
create unique index questions_source_key_key on questions (source_key);
alter table media add column source_name varchar(255)
  constraint media_source_name_check check (length(trim(source_name)) > 0);
alter table media add column source_sha256 char(64)
  constraint media_source_sha256_check check (source_sha256 ~ '^[0-9a-f]{64}$');
create unique index media_source_name_key on media (lower(source_name));

-- Structure lock (0040). One row only. While locked, sections, chapters and which chapters each test type has can't change.
create table structure_lock (
  id boolean primary key default true check (id),
  locked boolean not null default false,
  changed_by uuid references users (id) on delete set null,
  changed_at timestamptz
);

insert into structure_lock default values;

-- A section linked to every test type puts each of its chapters in every test type's book (0040); otherwise each of
-- its chapters belongs to one test type at most.
alter table sections add column linked_to_all boolean not null default false;

-- Bulk Listen (0041). A translation a bulk run checked stays "checked automatically" until a person checks it.
alter table page_translations add column checked_automatically boolean not null default false;
alter table page_translations add constraint page_translations_auto_check check (not checked_automatically or status = 'checked');
alter table question_translations add column checked_automatically boolean not null default false;
alter table question_translations add constraint question_translations_auto_check check (not checked_automatically or status = 'checked');

-- Call limits for a language voiced by Gemini (empty = no limit; the free tier allows about 10 a day and 3 a minute).
alter table voice_languages add column gemini_calls_per_day integer check (gemini_calls_per_day between 1 and 100000);
alter table voice_languages add column gemini_calls_per_minute integer check (gemini_calls_per_minute between 1 and 1000);

-- Which language a usage row was for, and how many service calls it made (for the Gemini limits).
alter table voice_usage add column language varchar(10);
alter table voice_usage add column calls integer not null default 1 check (calls >= 0);
create index voice_usage_language_idx on voice_usage (service, language, created_at);

-- One row per bulk run (chapter and language): its counts, and how it ended. Its log entry is written when it ends.
create table voice_bulk_runs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters (id) on delete cascade,
  language varchar(10) not null references voice_languages (code) on delete cascade,
  started_by uuid references users (id) on delete set null,
  started_at timestamptz not null default now(),
  last_step_at timestamptz not null default now(),
  finished_at timestamptz,
  items integer not null check (items >= 0),
  translated integer not null default 0 check (translated >= 0),
  audio integer not null default 0 check (audio >= 0),
  failed integer not null default 0 check (failed >= 0),
  outcome varchar(12) check (outcome in ('finished', 'stopped', 'limit', 'abandoned')),
  check ((finished_at is null) = (outcome is null))
);

create unique index voice_bulk_runs_open_key on voice_bulk_runs (chapter_id, language) where finished_at is null;
