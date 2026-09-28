-- "Choose the area" questions: the candidate picks one of several marked areas on a picture.
-- Only the list of allowed question types changes; existing questions are untouched.

begin;

alter table questions drop constraint questions_type_check;
alter table questions
  add constraint questions_type_check
  check (type in ('single_text', 'single_picture', 'multi_pick', 'hotspot', 'area_choice'));

commit;
