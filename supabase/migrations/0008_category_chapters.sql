-- Delta for a DB with 0007 applied. Links categories to the chapters their Mock test draws from.

begin;

-- No order column: chapters follow the Handbook order. Links are settings, so deletes cascade.
create table category_chapters (
  category_id uuid not null references categories (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (category_id, chapter_id)
);

create index category_chapters_chapter_idx on category_chapters (chapter_id);

commit;
