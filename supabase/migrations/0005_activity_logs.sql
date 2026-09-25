-- Delta for a DB with 0004 applied. Adds the read-only activity and login logs.

begin;

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

commit;
