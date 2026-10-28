-- 0039: bulk upload keys. A page or question from a batch keeps its key (e.g. AD-p012) so a re-upload updates it;
-- a picture keeps its batch file name and a fingerprint of the file. Items made by hand leave them empty.

begin;

alter table content_pages add column source_key varchar(40)
  constraint content_pages_source_key_check check (source_key ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$');
create unique index content_pages_source_key_key on content_pages (source_key);

alter table questions add column source_key varchar(40)
  constraint questions_source_key_check check (source_key ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,39}$');
create unique index questions_source_key_key on questions (source_key);

alter table media add column source_name varchar(255)
  constraint media_source_name_check check (length(trim(source_name)) > 0);
alter table media add column source_sha256 char(64)
  constraint media_source_sha256_check check (source_sha256 ~ '^[0-9a-f]{64}$');
create unique index media_source_name_key on media (lower(source_name));

commit;
