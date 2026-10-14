-- F28: login records also note a wrong current password in My account (5 in 15 minutes pauses the check).

alter table auth_events drop constraint auth_events_event_check;
alter table auth_events add constraint auth_events_event_check
  check (event in ('login_success', 'login_failed', 'logout', 'login_paused', 'password_check_failed'));
