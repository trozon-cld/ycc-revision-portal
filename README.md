# YCC Revision Portal

Revision platform for construction site workers preparing for the CITB HS&E test — designed to help them prepare with confidence.

Status: in active development.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- PostgreSQL on Supabase (database only, raw SQL via `pg`)
- Custom JWT auth (jose + bcryptjs, HTTP-only cookies)

## Roles

- **Superadmin** — manages Admins and has access to all candidates.
- **Admin** — creates and manages candidates, each scoped to a category with an access expiry.
- **Candidate** — logs in with an allotted credential to revise for their category.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` (Supabase pooler string) and `JWT_SECRET`.

3. In the Supabase SQL editor, run `supabase/schema.sql` for a fresh database. The files in `supabase/migrations/` are changes for databases created from an earlier version of the schema, so skip them on a fresh setup.

4. Generate the Superadmin password hash, paste it and the email into `supabase/seed.sql`, then run that file:

   ```bash
   npm run hash -- "YourStrongPassword"
   ```

5. Start the dev server and open [http://localhost:3000](http://localhost:3000):

   ```bash
   npm run dev
   ```

## Project structure

- `app/` — routes: `/login`, `/admin/*` (Admin/Superadmin), `/dashboard` (Candidate), `/access-expired`
- `lib/auth/` — JWT signing/verification, session cookie, role guard
- `lib/db/pool.ts` — shared Postgres connection pool
- `proxy.ts` — route protection by role, block and expiry
- `supabase/` — schema, migrations and seed

This project runs Next.js 16, which differs from older versions. See `AGENTS.md` and `node_modules/next/dist/docs/` before changing routing, data fetching or config.
