-- 0035: which Listen languages each category offers. Listen per category is now off, all languages (every live
-- language, including ones added later) or chosen languages; English is always offered while Listen is on.
alter table categories add column listen_mode varchar(10) not null default 'all' check (listen_mode in ('off', 'all', 'chosen'));
update categories set listen_mode = case when listen_enabled then 'all' else 'off' end;
alter table categories drop column listen_enabled;

-- The chosen languages (used when listen_mode = 'chosen'; kept when the mode changes, so they come back).
create table category_languages (
  category_id uuid not null references categories (id) on delete cascade,
  language varchar(10) not null references voice_languages (code) check (language <> 'en'),
  primary key (category_id, language)
);
