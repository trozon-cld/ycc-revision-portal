-- 0040: structure lock and section linking. While locked, sections, chapters and which chapters each test type has
-- can't change. A section "linked to every test type" puts each of its chapters in every test type's book (A–D).

begin;

create table structure_lock (
  id boolean primary key default true check (id),
  locked boolean not null default false,
  changed_by uuid references users (id) on delete set null,
  changed_at timestamptz
);

insert into structure_lock default values;

alter table sections add column linked_to_all boolean not null default false;

-- Today's sections whose every chapter is in every test type (A–D) become linked to every test type.
update sections s set linked_to_all = true
where exists (select 1 from chapters c where c.section_id = s.id)
  and not exists (
    select 1 from chapters c cross join test_types t
    where c.section_id = s.id
      and not exists (select 1 from test_type_chapters l where l.chapter_id = c.id and l.test_type_id = t.id)
  );

commit;
