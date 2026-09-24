-- Delta for a DB with 0008 applied. Adds the Handbook image library.

begin;

create table media (
  id uuid primary key default gen_random_uuid(),
  -- Paths inside the private storage bucket. The thumbnail is a small copy for grids and pickers.
  storage_path varchar not null unique,
  thumb_path varchar not null unique,
  original_name varchar(255) not null,
  mime_type varchar not null check (mime_type in ('image/webp', 'image/png', 'image/jpeg')),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  byte_size integer not null check (byte_size > 0),
  -- Required: read by screen readers, and later by Listen.
  alt_text varchar(300) not null check (length(trim(alt_text)) > 0),
  uploaded_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_created_at_idx on media (created_at desc);

commit;
