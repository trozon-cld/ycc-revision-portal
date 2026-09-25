-- Delta for a DB with 0012 applied. Size and position of a question's picture, as for picture blocks.

begin;

-- Empty = full width, centred (how every existing question looks). Position only applies below full width.
alter table questions
  add column stem_media_size varchar(10) check (stem_media_size in ('small', 'medium', 'large')),
  add column stem_media_align varchar(10) check (stem_media_align in ('left', 'right')),
  add constraint questions_stem_media_layout_check check (
    (stem_media_id is not null or (stem_media_size is null and stem_media_align is null))
    and (stem_media_align is null or stem_media_size is not null)
  );

commit;
