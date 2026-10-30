-- 0041: bulk Listen. Translations a bulk run checked are marked "checked automatically" until a person checks them;
-- each Gemini-voiced language has call limits staff can change; voice usage records the language and calls for those
-- limits; each bulk run keeps a small record (its one log entry is written when it ends, or when it's found abandoned).

begin;

alter table page_translations add column checked_automatically boolean not null default false;
alter table page_translations add constraint page_translations_auto_check check (not checked_automatically or status = 'checked');
alter table question_translations add column checked_automatically boolean not null default false;
alter table question_translations add constraint question_translations_auto_check check (not checked_automatically or status = 'checked');

-- Empty means no limit. Gemini's free tier allows about 10 speech calls a day and 3 a minute.
alter table voice_languages add column gemini_calls_per_day integer check (gemini_calls_per_day between 1 and 100000);
alter table voice_languages add column gemini_calls_per_minute integer check (gemini_calls_per_minute between 1 and 1000);
update voice_languages set gemini_calls_per_day = 10, gemini_calls_per_minute = 3 where code = 'cy';

alter table voice_usage add column language varchar(10);
alter table voice_usage add column calls integer not null default 1 check (calls >= 0);
create index voice_usage_language_idx on voice_usage (service, language, created_at);

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

-- One open run per chapter and language.
create unique index voice_bulk_runs_open_key on voice_bulk_runs (chapter_id, language) where finished_at is null;

commit;
