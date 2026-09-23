-- YCC Revision Portal — Day 1 schema
-- Run this in the Supabase SQL editor.

create extension if not exists pgcrypto;

create type role_type as enum ('superadmin', 'admin', 'candidate');

-- A Candidate is scoped to one category at credential creation (e.g.
-- Operative, Supervisor). Admins/Superadmins have no category — NULL.
-- Distinct from the topics/questions stub tables below, which are reserved
-- for the actual Prepare/Practice/Mock Test content *within* a category, a
-- later feature.
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

-- Stub tables, reserved for future modules. No columns beyond identity yet —
-- real shape comes when we design Prepare/Practice/Mock Test content.
create table topics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid references topics (id) on delete cascade,
  created_at timestamptz not null default now()
);
