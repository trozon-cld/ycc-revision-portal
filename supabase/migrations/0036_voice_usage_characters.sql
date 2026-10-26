-- 0036 (G3a): the voice services' hourly allowance counts characters (a whole job reserved before it starts),
-- with everyone's monthly totals per service; Gemini translation is gone, so the translator note is dropped.
drop table voice_requests;

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

alter table voice_languages drop column translator_note;
