-- The site's own database login, ycc_portal: it can read and change rows in the portal's tables, nothing more.
-- Run once per database as the master login (never as ycc_portal); running it again only sets the new password.
--
--   psql "host=ENDPOINT port=5432 dbname=ycc user=ycc_db_admin sslmode=verify-full sslrootcert=C:/aws/global-bundle.pem" -v portal_password=LETTERS_AND_NUMBERS -f supabase/limited-login.sql
--
-- Then use ycc_portal and that password in the site's DATABASE_URL. Migrations and restore-database stay on the master login.

\set ON_ERROR_STOP on

\if :{?portal_password}
\else
  \echo 'Give the new password: -v portal_password=... (letters and numbers only, 30 or more)'
  \quit
\endif

begin;

select format('create role ycc_portal login password %L', :'portal_password')
where not exists (select from pg_roles where rolname = 'ycc_portal')
\gexec

select format('alter role ycc_portal login password %L', :'portal_password')
\gexec

grant usage on schema public to ycc_portal;

grant select, insert, update, delete on all tables in schema public to ycc_portal;
grant usage, select on all sequences in schema public to ycc_portal;

-- Tables and counters that later migrations create (as this login) get the same rights.
alter default privileges in schema public grant select, insert, update, delete on tables to ycc_portal;
alter default privileges in schema public grant usage, select on sequences to ycc_portal;

commit;

\echo 'ycc_portal is ready. Use it in the site''s DATABASE_URL.'
