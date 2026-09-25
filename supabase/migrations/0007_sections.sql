-- Delta for a DB with 0006 applied. Adds Handbook sections: Section → Chapter → Pages.

begin;

create table sections (
  id uuid primary key default gen_random_uuid(),
  -- Display order; the letter (A, B, C…) is derived from it. Deferred so a reorder can swap.
  position integer not null check (position > 0),
  title varchar(120) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sections_position_key unique (position) deferrable initially deferred
);

create unique index sections_title_key on sections (lower(title));

-- Placeholder section titles, renameable.
insert into sections (position, title) values
  (1, 'Working environment'),
  (2, 'Occupational health'),
  (3, 'Safety'),
  (4, 'High risk activities'),
  (5, 'Specialist activities');

alter table chapters add column section_id uuid references sections (id) on delete restrict;

-- Place existing chapters by their current order (01–05 → A, 06–09 → B, 10–12 → C, the rest → D).
update chapters c
set section_id = s.id
from sections s
where s.position = case
  when c.position <= 5 then 1
  when c.position <= 9 then 2
  when c.position <= 12 then 3
  else 4
end;

-- Chapter position now counts within its section; the displayed number is derived across the book.
alter table chapters drop constraint chapters_position_key;

update chapters c
set position = ranked.section_position
from (
  select id, row_number() over (partition by section_id order by position) as section_position
  from chapters
) ranked
where ranked.id = c.id;

alter table chapters alter column section_id set not null;

alter table chapters
  add constraint chapters_section_position_key unique (section_id, position) deferrable initially deferred;

commit;
