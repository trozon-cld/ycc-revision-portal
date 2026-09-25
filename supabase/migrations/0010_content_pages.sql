-- Delta for a DB with 0009 applied. Adds Handbook content pages and their book order.

begin;

create table content_pages (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters (id) on delete restrict,
  -- Admin-only label; candidates see only the blocks.
  title varchar(120) not null check (length(trim(title)) > 0),
  -- Ordered block list, validated by lib/content/blocks.ts before every save.
  blocks jsonb not null default '[]' check (jsonb_typeof(blocks) = 'array'),
  -- Goes up whenever the blocks change: guards against overwriting and marks audio stale later.
  content_version integer not null default 1 check (content_version > 0),
  status content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_pages_chapter_idx on content_pages (chapter_id);

-- The book order within each chapter. Questions will join this list later.
create table handbook_items (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters (id) on delete restrict,
  position integer not null check (position > 0),
  content_page_id uuid not null unique references content_pages (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint handbook_items_chapter_position_key unique (chapter_id, position) deferrable initially deferred
);

-- Pictures used by each page, rewritten on every save, so a picture in use cannot be deleted.
create table content_page_media (
  content_page_id uuid not null references content_pages (id) on delete cascade,
  media_id uuid not null references media (id) on delete restrict,
  primary key (content_page_id, media_id)
);

create index content_page_media_media_idx on content_page_media (media_id);

commit;
