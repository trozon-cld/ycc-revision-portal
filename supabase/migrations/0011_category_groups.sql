-- Delta for a DB with 0010 applied. Category groups, and each candidate's current category.

begin;

-- Candidates can switch only between categories of the same group. Managed by the Superadmin.
create table category_groups (
  id uuid primary key default gen_random_uuid(),
  position integer not null check (position > 0),
  name varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint category_groups_position_key unique (position) deferrable initially deferred
);

create unique index category_groups_name_key on category_groups (lower(name));

insert into category_groups (position, name) values (1, 'General'), (2, 'Special');

alter table categories add column group_id uuid references category_groups (id) on delete restrict;
update categories set group_id = (select id from category_groups where position = 1);
alter table categories alter column group_id set not null;
create index categories_group_idx on categories (group_id);

-- category_id stays the category the Admin assigned; current_category_id is the candidate's own choice.
alter table users add column current_category_id uuid references categories (id);
update users set current_category_id = category_id where role = 'candidate';
alter table users add constraint users_current_category_check
  check ((role = 'candidate') = (current_category_id is not null));
create index users_current_category_idx on users (current_category_id);

create function check_candidate_category_group() returns trigger
language plpgsql as $$
begin
  if new.role = 'candidate' and new.current_category_id is not null
     and (select group_id from categories where id = new.category_id)
         is distinct from (select group_id from categories where id = new.current_category_id) then
    raise exception 'A candidate''s current category must be in the same group as their assigned category'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger users_category_group_check
  before insert or update of category_id, current_category_id on users
  for each row execute function check_candidate_category_group();

-- Moving a category to another group would silently move its candidates too, so it's refused.
create function check_category_group_move() returns trigger
language plpgsql as $$
begin
  if new.group_id is distinct from old.group_id
     and exists (select 1 from users where category_id = new.id or current_category_id = new.id) then
    raise exception 'A category in use by candidates cannot move to another group'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger categories_group_move_check
  before update of group_id on categories
  for each row execute function check_category_group_move();

commit;
