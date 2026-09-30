-- Delta for a DB with 0016 applied. A display name for every user; existing users start without one.

begin;

alter table users
  add column full_name varchar(100) check (full_name is null or length(trim(full_name)) > 0);

commit;
