-- Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create type role_type as enum ('superadmin', 'admin', 'candidate');

-- A Candidate's assignment (e.g. Operative).
create table categories (
  id uuid primary key default gen_random_uuid(),
  name varchar not null unique,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email varchar not null unique,
  password_hash varchar not null,
  role role_type not null,
  -- Candidates only. NULL for Admins/Superadmins.
  category_id uuid references categories (id),
  -- Expiry/block checks apply only to candidates. Admins/Superadmins keep
  -- these NULL and bypass the checks (see proxy.ts).
  access_start_at timestamptz,
  access_expires_at timestamptz,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  ip_address varchar,
  logged_in_at timestamptz not null default now()
);

-- topics/questions intentionally omitted — added when we design
-- Prepare/Practice/Mock Test content.
