-- 0037: names follow the content model. Groups are test areas, categories are test types (each test type's book
-- is its linked chapters). Renames only: no rows are added, changed or removed.

begin;

-- Tables
alter table category_groups rename to test_areas;
alter table categories rename to test_types;
alter table category_chapters rename to test_type_chapters;
alter table category_languages rename to test_type_languages;

-- Columns
alter table test_types rename column group_id to test_area_id;
alter table users rename column category_id to test_type_id;
alter table users rename column current_category_id to current_test_type_id;
alter table test_type_chapters rename column category_id to test_type_id;
alter table test_type_languages rename column category_id to test_type_id;
alter table handbook_progress rename column category_id to test_type_id;
alter table handbook_chapter_progress rename column category_id to test_type_id;
alter table question_results rename column category_id to test_type_id;
alter table practice_sessions rename column category_id to test_type_id;
alter table question_flags rename column category_id to test_type_id;
alter table mock_attempts rename column category_id to test_type_id;

-- Constraints (the names a fresh schema.sql gives them)
alter table test_areas rename constraint category_groups_pkey to test_areas_pkey;
alter table test_areas rename constraint category_groups_position_check to test_areas_position_check;
alter table test_areas rename constraint category_groups_position_key to test_areas_position_key;
alter table test_types rename constraint categories_pkey to test_types_pkey;
alter table test_types rename constraint categories_group_id_fkey to test_types_test_area_id_fkey;
alter table test_types rename constraint categories_front_cover_media_id_fkey to test_types_front_cover_media_id_fkey;
alter table test_types rename constraint categories_back_cover_media_id_fkey to test_types_back_cover_media_id_fkey;
alter table test_types rename constraint categories_listen_mode_check to test_types_listen_mode_check;
alter table test_type_chapters rename constraint category_chapters_pkey to test_type_chapters_pkey;
alter table test_type_chapters rename constraint category_chapters_category_id_fkey to test_type_chapters_test_type_id_fkey;
alter table test_type_chapters rename constraint category_chapters_chapter_id_fkey to test_type_chapters_chapter_id_fkey;
alter table test_type_languages rename constraint category_languages_pkey to test_type_languages_pkey;
alter table test_type_languages rename constraint category_languages_category_id_fkey to test_type_languages_test_type_id_fkey;
alter table test_type_languages rename constraint category_languages_language_check to test_type_languages_language_check;
alter table test_type_languages rename constraint category_languages_language_fkey to test_type_languages_language_fkey;
alter table users rename constraint users_category_id_fkey to users_test_type_id_fkey;
alter table users rename constraint users_current_category_id_fkey to users_current_test_type_id_fkey;
alter table users rename constraint users_current_category_check to users_current_test_type_check;
alter table handbook_progress rename constraint handbook_progress_category_id_fkey to handbook_progress_test_type_id_fkey;
alter table handbook_chapter_progress rename constraint handbook_chapter_progress_category_id_fkey to handbook_chapter_progress_test_type_id_fkey;
alter table question_results rename constraint question_results_category_id_fkey to question_results_test_type_id_fkey;
alter table practice_sessions rename constraint practice_sessions_category_id_fkey to practice_sessions_test_type_id_fkey;
alter table question_flags rename constraint question_flags_category_id_fkey to question_flags_test_type_id_fkey;
alter table mock_attempts rename constraint mock_attempts_category_id_fkey to mock_attempts_test_type_id_fkey;

-- Indexes
alter index category_groups_name_key rename to test_areas_name_key;
alter index categories_name_key rename to test_types_name_key;
alter index categories_group_idx rename to test_types_test_area_idx;
alter index categories_front_cover_idx rename to test_types_front_cover_idx;
alter index categories_back_cover_idx rename to test_types_back_cover_idx;
alter index category_chapters_chapter_idx rename to test_type_chapters_chapter_idx;
alter index users_category_idx rename to users_test_type_idx;
alter index users_current_category_idx rename to users_current_test_type_idx;
alter index handbook_progress_category_idx rename to handbook_progress_test_type_idx;
alter index handbook_chapter_progress_category_idx rename to handbook_chapter_progress_test_type_idx;
alter index question_results_category_idx rename to question_results_test_type_idx;
alter index practice_sessions_category_idx rename to practice_sessions_test_type_idx;
alter index question_flags_category_idx rename to question_flags_test_type_idx;
alter index mock_attempts_category_idx rename to mock_attempts_test_type_idx;

-- The two checks are rewritten (their bodies name the renamed columns), then the old ones are dropped.
create function check_candidate_test_area() returns trigger
language plpgsql as $$
begin
  if new.role = 'candidate' and new.current_test_type_id is not null
     and (select test_area_id from test_types where id = new.test_type_id)
         is distinct from (select test_area_id from test_types where id = new.current_test_type_id) then
    raise exception 'A candidate''s current test type must be in the same test area as their assigned test type'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger users_category_group_check on users;
create trigger users_test_area_check
  before insert or update of test_type_id, current_test_type_id on users
  for each row execute function check_candidate_test_area();
drop function check_candidate_category_group();

create function check_test_type_area_move() returns trigger
language plpgsql as $$
begin
  if new.test_area_id is distinct from old.test_area_id
     and exists (select 1 from users where test_type_id = new.id or current_test_type_id = new.id) then
    raise exception 'A test type in use by candidates cannot move to another test area'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger categories_group_move_check on test_types;
create trigger test_types_area_move_check
  before update of test_area_id on test_types
  for each row execute function check_test_type_area_move();
drop function check_category_group_move();

-- An Admin's Activity page: new switches use the new key; older entries keep the old one (the log is never rewritten).
-- "if exists": databases that skipped 0019 never had this index; it is created either way.
drop index if exists activity_logs_switch_target_idx;
create index activity_logs_switch_target_idx on activity_logs (target_id, created_at desc)
  where action in ('candidate.test_type_switched', 'candidate.category_switched');

commit;
