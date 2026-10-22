-- 0032: Listen can be turned on or off per category (on by default, so nothing candidates have today changes).
-- When off, candidates in that category see no Listen button or Listening language, and no audio is served.
alter table categories add column listen_enabled boolean not null default true;
