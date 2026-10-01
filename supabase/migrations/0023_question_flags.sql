-- Delta for a DB with 0022 applied. Flag for review (per candidate, category and question) and the
-- focused ways to practise.

begin;

-- A candidate's own bookmark on a question, set in Practice or its report. Not activity-log data.
create table question_flags (
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  question_id uuid not null references questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, category_id, question_id)
);

create index question_flags_category_idx on question_flags (category_id);
create index question_flags_question_idx on question_flags (question_id);

alter table practice_sessions drop constraint practice_sessions_mode_check;
alter table practice_sessions add constraint practice_sessions_mode_check
  check (mode in ('smart', 'chapters', 'types', 'all', 'retry', 'wrong', 'flagged', 'unseen', 'weak'));

commit;
