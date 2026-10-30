-- 0038: test types keep a set order within their test area (Move up / Move down), like sections and chapters.
-- Existing test types are numbered A–Z within each test area, the order they were listed in before.

begin;

alter table test_types add column position integer;

update test_types t
set position = ranked.position
from (select id, row_number() over (partition by test_area_id order by lower(name), name)::int as position from test_types) ranked
where ranked.id = t.id;

alter table test_types alter column position set not null;
alter table test_types add constraint test_types_position_check check (position > 0);
-- Deferred so a reorder can swap two positions.
alter table test_types add constraint test_types_area_position_key unique (test_area_id, position) deferrable initially deferred;

commit;
