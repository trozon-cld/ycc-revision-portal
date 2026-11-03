-- 0042: office network. When it's on, Admins (not the Superadmin, not candidates) can sign in and use admin pages only
-- from the listed internet addresses, unless their account is exempt. Refused sign-ins are kept in the login records.

begin;

create table office_network (
  id boolean primary key default true check (id),
  is_on boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into office_network default values;

-- One address ("203.0.113.8") or range ("203.0.113.8/30"), IPv4 or IPv6, as the app stores it after checking.
create table office_network_addresses (
  id uuid primary key default gen_random_uuid(),
  address varchar(64) not null unique,
  label varchar(60) not null check (length(trim(label)) > 0),
  created_at timestamptz not null default now()
);

alter table users add column office_exempt boolean not null default false;
alter table users add constraint users_office_exempt_check check (not office_exempt or role = 'admin');

alter table auth_events drop constraint auth_events_event_check;
alter table auth_events add constraint auth_events_event_check
  check (event in ('login_success', 'login_failed', 'logout', 'login_paused', 'password_check_failed', 'login_refused_network'));

-- Refused sign-ins count towards the login pauses, like failed ones.
drop index auth_events_failed_email_idx;
drop index auth_events_failed_ip_idx;
create index auth_events_failed_email_idx on auth_events (email, created_at desc) where event in ('login_failed', 'login_refused_network');
create index auth_events_failed_ip_idx on auth_events (ip_address, created_at desc) where event in ('login_failed', 'login_refused_network');

commit;
