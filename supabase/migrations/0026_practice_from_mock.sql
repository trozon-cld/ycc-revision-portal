-- Delta for a DB with 0025 applied. Practice can start from a mock test: its wrong and unanswered
-- questions (mode 'mock'; choices holds the mock test's id).

begin;

alter table practice_sessions drop constraint practice_sessions_mode_check;
alter table practice_sessions add constraint practice_sessions_mode_check
  check (mode in ('smart', 'chapters', 'types', 'all', 'retry', 'wrong', 'flagged', 'unseen', 'weak', 'mock'));

commit;
