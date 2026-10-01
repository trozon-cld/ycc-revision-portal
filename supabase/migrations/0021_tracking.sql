-- Delta for a DB with 0020 applied. Candidates' progress, kept per category: Handbook pages done and
-- question results (Handbook and Practice counted separately). Not activity-log data.

begin;

-- Handbook items done, one row per chapter: a content page once its last part was on screen, a
-- question once Check or Reveal was used. Ids of deleted items drop out on the chapter's next save.
create table handbook_chapter_progress (
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  done_items uuid[] not null default '{}' check (cardinality(done_items) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id, chapter_id)
);

create index handbook_chapter_progress_category_idx on handbook_chapter_progress (category_id);
create index handbook_chapter_progress_chapter_idx on handbook_chapter_progress (chapter_id);

-- One row per candidate, category and question; counters stop at the smallint limit.
-- A Reveal before any try counts as not right first time. Practice columns are filled from E4a-2.
create table question_results (
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  handbook_tries smallint not null default 0,
  handbook_right smallint not null default 0,
  handbook_reveals smallint not null default 0,
  handbook_first_right boolean,
  handbook_last_right boolean,
  handbook_at timestamptz,
  practice_tries smallint not null default 0,
  practice_right smallint not null default 0,
  practice_first_right boolean,
  practice_last_right boolean,
  practice_at timestamptz,
  primary key (user_id, category_id, question_id),
  constraint question_results_counts_check check (
    handbook_tries >= 0 and handbook_reveals >= 0 and practice_tries >= 0
    and handbook_right between 0 and handbook_tries
    and practice_right between 0 and practice_tries
  )
);

create index question_results_category_idx on question_results (category_id);
create index question_results_question_idx on question_results (question_id);

commit;
