-- 0030: each candidate's listening language (V5, Listen). English unless they choose another on their Account page.
-- Codes come from lib/voice/languages.ts; staff accounts have the column too but nothing uses it.

alter table users add column preferred_language varchar(10) not null default 'en'
  check (preferred_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$');
