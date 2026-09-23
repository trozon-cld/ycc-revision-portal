-- Delta for a DB with 0003 applied. Existing candidates must be deleted first,
-- otherwise the check fails; the transaction makes that failure a clean no-op.

begin;

alter table users
  add column admin_id uuid references users (id) on delete restrict;

create index users_admin_id_idx on users (admin_id);

alter table users
  add constraint users_candidate_fields_check check (
    (role = 'candidate' and category_id is not null and admin_id is not null)
    or (role <> 'candidate' and admin_id is null)
  );

commit;
