-- Delta for a DB with 0011 applied. Question bank, and questions as Handbook items.

begin;

create table questions (
  id uuid primary key default gen_random_uuid(),
  -- Shown to admins as "Q0042". Never reused, even after a delete.
  ref_no integer generated always as identity unique,
  chapter_id uuid not null references chapters (id) on delete restrict,
  -- Keys match lib/questions/registry.ts. The app offers a type only once it is built.
  type varchar(30) not null check (type in ('single_text', 'single_picture', 'multi_pick', 'hotspot')),
  status content_status not null default 'draft',
  stem_text varchar(1000) not null check (length(trim(stem_text)) > 0),
  -- Optional picture for any type.
  stem_media_id uuid references media (id) on delete restrict,
  -- Type-specific shapes, validated by lib/questions before every save. The answer is kept
  -- apart so practice and exam can send the question without it.
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  answer jsonb not null check (jsonb_typeof(answer) = 'object'),
  explanation varchar(2000) check (explanation is null or length(trim(explanation)) > 0),
  in_practice boolean not null default true,
  in_mock boolean not null default true,
  content_version integer not null default 1 check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index questions_chapter_idx on questions (chapter_id);
create index questions_stem_media_idx on questions (stem_media_id);

-- Every picture a question uses, rewritten on every save, so a picture in use cannot be deleted.
create table question_media (
  question_id uuid not null references questions (id) on delete cascade,
  media_id uuid not null references media (id) on delete restrict,
  primary key (question_id, media_id)
);

create index question_media_media_idx on question_media (media_id);

-- An item is exactly one content page or one question. A question in the book can't be deleted.
alter table handbook_items
  alter column content_page_id drop not null,
  add column question_id uuid unique references questions (id) on delete restrict,
  add constraint handbook_items_one_kind_check check (num_nonnulls(content_page_id, question_id) = 1);

commit;
