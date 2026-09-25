-- Delta for a DB with 0005 applied. Adds Handbook chapters.

begin;

-- Shared by chapters now, and by content pages and questions later.
create type content_status as enum ('draft', 'published');

create table chapters (
  id uuid primary key default gen_random_uuid(),
  -- Display order, shown as "01", "02"… Deferred so a reorder can swap two positions.
  position integer not null check (position > 0),
  title varchar(120) not null,
  status content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chapters_position_key unique (position) deferrable initially deferred
);

create unique index chapters_title_key on chapters (lower(title));

-- Placeholder chapter titles, renameable. Only seeds an empty table.
insert into chapters (position, title)
select position, title
from (values
  (1, 'General responsibilities'),
  (2, 'Accident reporting and recording'),
  (3, 'First aid and emergency procedures'),
  (4, 'Personal protective equipment'),
  (5, 'Environmental awareness and waste control'),
  (6, 'Dust and fumes (respiratory hazards)'),
  (7, 'Noise and vibration'),
  (8, 'Health and welfare'),
  (9, 'Manual handling'),
  (10, 'Safety signs'),
  (11, 'Fire prevention and control'),
  (12, 'Electrical safety, tools and equipment'),
  (13, 'Site transport and lifting operations'),
  (14, 'Working at height'),
  (15, 'Excavations and confined spaces'),
  (16, 'Hazardous substances')
) as seed (position, title)
where not exists (select 1 from chapters);

commit;
