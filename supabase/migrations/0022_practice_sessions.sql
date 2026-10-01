-- Delta for a DB with 0021 applied. Practice runs; answers themselves go to question_results.

begin;

-- results: one letter per question in order: '.' not answered yet, R right, W wrong, S skipped
-- (removed since the start). The latest finished run keeps question_ids/results; older ones only totals.
create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  mode varchar(10) not null check (mode in ('smart', 'chapters', 'types', 'all', 'retry')),
  -- Chapter ids or question types chosen; empty for the other ways.
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
create index practice_sessions_category_idx on practice_sessions (category_id);

commit;
