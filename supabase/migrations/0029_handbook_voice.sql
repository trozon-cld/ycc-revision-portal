-- Listen (phase 2), V1: translated Handbook pages and their audio, plus a count of voice service requests
-- (each content editor may make 30 an hour). English is the page itself, so it has audio but no translation.

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

-- One row per call to the voice service, for the hourly cap; rows older than a day are removed as new ones come.
create table voice_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references users (id) on delete cascade,
  kind varchar(12) not null check (kind in ('translate', 'speech')),
  created_at timestamptz not null default now()
);

create index voice_requests_user_idx on voice_requests (user_id, created_at);
