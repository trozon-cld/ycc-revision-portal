-- 0031: Listen for Handbook question pages (V6a). Like page_translations / page_audio, but a question's
-- translation covers only what is read aloud: the question text and its options (never the explanation).
-- Out of date is decided by comparing the English question text and options with `source`, a copy taken
-- when the translation or audio was made, so edits to the answer or explanation don't make it out of date.

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
