-- Delta for a DB with 0015 applied. Candidates' reading position (per category) and text size.

begin;

-- Chosen with A−/A+ in the reader; one setting per person, on every device. Empty = 16 px.
alter table users
  add column reader_text_size smallint check (reader_text_size in (14, 16, 18, 20, 22, 24));

-- Where each candidate last was in each category's book. A deleted page just resets it to the start.
create table handbook_progress (
  user_id uuid not null references users (id) on delete cascade,
  category_id uuid not null references categories (id) on delete cascade,
  item_id uuid references handbook_items (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

create index handbook_progress_category_idx on handbook_progress (category_id);
create index handbook_progress_item_idx on handbook_progress (item_id);

commit;
