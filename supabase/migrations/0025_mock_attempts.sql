-- Delta for a DB with 0024 applied. Mock tests: one row per test, answers marked only when it ends.

begin;

-- While open: the drawn questions, the answers as given (marked at the end) and this test's own flags.
-- After it ends: marks and totals; the newest 10 per candidate keep their questions and answers for review.
create table mock_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  question_ids uuid[] check (cardinality(question_ids) between 1 and 50),
  -- One entry per question: the answer as given, or null.
  responses jsonb check (jsonb_typeof(responses) = 'array'),
  -- One letter per question: '.' or F (flagged for review in this test only).
  flags text check (flags ~ '^[.F]*$'),
  -- Set when it ends, one letter per question: R right, W wrong, U unanswered, S removed from the bank meanwhile.
  marks text check (marks ~ '^[RWUS]*$'),
  -- The question on screen, so a resumed test opens where it was left.
  position smallint not null default 0 check (position >= 0),
  total smallint not null check (total between 1 and 50),
  duration_seconds integer not null check (duration_seconds > 0),
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  updated_at timestamptz not null default now(),
  -- submitted, time_up (ended at 0 on the test screen), away (time ran out while away),
  -- moved (the candidate's category was changed by their Admin).
  ended_how varchar(10) check (ended_how in ('submitted', 'time_up', 'away', 'moved')),
  ended_at timestamptz,
  -- Totals, kept after the question list is trimmed. out_of leaves out removed questions.
  answered smallint check (answered >= 0),
  right_count smallint check (right_count between 0 and answered),
  out_of smallint check (out_of between 0 and total),
  seconds_taken integer check (seconds_taken >= 0),
  -- Right and out of, per chapter: {"chapterId": [right, outOf]}.
  chapter_summary jsonb,
  constraint mock_attempts_list_check check (
    (question_ids is null) = (responses is null) and (question_ids is null) = (flags is null)
    and (question_ids is null or (jsonb_array_length(responses) = total and length(flags) = total and cardinality(question_ids) = total))
    and (marks is null or (question_ids is not null and length(marks) = total))
  ),
  constraint mock_attempts_end_check check (
    (ended_at is null) = (ended_how is null)
    and (ended_at is not null or (question_ids is not null and marks is null))
    and (ended_at is null or (answered is not null and right_count is not null and out_of is not null and seconds_taken is not null))
  )
);

-- One mock test in progress per candidate.
create unique index mock_attempts_open_key on mock_attempts (user_id) where ended_at is null;
create index mock_attempts_user_idx on mock_attempts (user_id, ended_at desc);
create index mock_attempts_category_idx on mock_attempts (category_id);

commit;
