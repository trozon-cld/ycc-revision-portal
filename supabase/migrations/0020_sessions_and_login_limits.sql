-- Delta for a DB with 0019 applied. Live session checks (a counter that signs out other devices when a
-- password changes), login rate limiting, and the unused login_logs table removed.

begin;

alter table users
  add column session_version integer not null default 1 check (session_version > 0);

alter table auth_events drop constraint auth_events_event_check;
alter table auth_events add constraint auth_events_event_check
  check (event in ('login_success', 'login_failed', 'logout', 'login_paused'));

-- Rate limiting counts recent failed logins per email and per address.
create index auth_events_failed_email_idx on auth_events (email, created_at desc) where event = 'login_failed';
create index auth_events_failed_ip_idx on auth_events (ip_address, created_at desc) where event = 'login_failed';

-- Duplicated the login events and was never read.
drop table login_logs;

commit;
