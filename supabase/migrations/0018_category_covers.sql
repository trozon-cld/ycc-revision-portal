-- Delta for a DB with 0017 applied. Optional Handbook cover pictures per category, from the Media library.

begin;

alter table categories
  add column front_cover_media_id uuid references media (id) on delete restrict,
  add column back_cover_media_id uuid references media (id) on delete restrict;

create index categories_front_cover_idx on categories (front_cover_media_id);
create index categories_back_cover_idx on categories (back_cover_media_id);

commit;
