-- Delta for a DB with 0023 applied: category names unique whatever the capitals, two indexes,
-- and archiving of old login records (saved to a file first, only then deleted).

-- Run this first; it must return no rows (two categories whose names differ only in capitals):
-- select lower(name), count(*) from categories group by 1 having count(*) > 1;

begin;

-- Same rule as groups, sections and chapters.
alter table categories drop constraint categories_name_key;
create unique index categories_name_key on categories (lower(name));

create index users_category_idx on users (category_id);
create index media_uploaded_by_idx on media (uploaded_by);

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

drop trigger auth_events_read_only on auth_events;
create trigger auth_events_read_only
  before update or delete on auth_events
  for each row execute function guard_auth_events();

commit;
