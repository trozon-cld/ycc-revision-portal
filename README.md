# YCC Revision Portal

Revision platform for construction site workers preparing for the CITB HS&E test — designed to help them prepare with confidence.

Status: in active development.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- PostgreSQL on Supabase (database only, raw SQL via `pg`)
- Custom JWT auth (jose + bcryptjs, HTTP-only cookies)

## Roles

- **Superadmin** — manages Admins and has access to all candidates.
- **Admin** — creates and manages candidates, each with an assigned category and an access expiry.
- **Candidate** — logs in with an allotted credential and revises in one category at a time, starting with the assigned one; they can switch within its category group.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` (Supabase pooler string) and `JWT_SECRET`.

3. In the Supabase SQL editor, run `supabase/schema.sql` for a fresh database. The files in `supabase/migrations/` are changes for databases created from an earlier version of the schema, so skip them on a fresh setup.

4. For the image library (Admin → Media), in Supabase:
   - **Storage → New bucket**, name `handbook-media`, **Public bucket off** (pictures are served through short-lived signed links).
   - Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API; the secret or legacy service_role key) to `.env.local`. They are server-only; never prefix them with `NEXT_PUBLIC_`.
   - The same bucket holds archived login records (Activity → Archives) in an `archives/` folder. If you limited the bucket's allowed file types, add `application/gzip`.

5. Generate the Superadmin password hash, paste it and the email into `supabase/seed.sql`, then run that file:

   ```bash
   npm run hash -- "YourStrongPassword"
   ```

6. Start the dev server and open [http://localhost:3000](http://localhost:3000):

   ```bash
   npm run dev
   ```

## Project structure

- `app/` — routes: `/login`, `/admin/*` (Admin/Superadmin, including `/admin/activity` logs and `/admin/handbook` sections and chapters, `/admin/handbook/chapters/[id]` page lists, `/admin/handbook/pages/[id]` page editor, `/admin/media` image library), `/dashboard` (Candidate home, `/dashboard/category` to switch category within the group, `/dashboard/prepare` the Handbook for the current category, `/dashboard/practice` Practice setup and `/dashboard/practice/[id]` a practice run or its report, `/dashboard/help`), `/access-expired`
- `lib/auth/` — JWT signing/verification, session cookie, role guard
- `components/admin/` — compact admin console UI (sidebar shell, tables, row menus, slide-in panels); admin pages must build from these. Candidate pages keep the large, simple style.
- `lib/db/` — shared Postgres pool and transaction helper
- `lib/users/` — display-name rules shared by account, admin and candidate forms
- `lib/content/` — Handbook page blocks (types, validation, **bold** markup) and book sheet rules
- `components/candidate/` — candidate page shell (header, `PageBody`) and home-screen section cards
- `components/learning/` — candidate-facing renderers: blocks and the fixed-page book reader (large-target style)
- `lib/storage/` — the only code that talks to the storage provider (upload, delete, signed links)
- `lib/media/` — image checks (real type and size from the file) and in-browser WebP conversion
- `lib/practice/` — Practice: question pool, Smart practice picking, runs and reports (server-marked)
- `lib/progress/` — candidates' progress per category (Handbook pages done, question results); not activity-log data
- `lib/audit/` — activity and login logs (every loggable action is listed in `lib/audit/actions.ts`)
- `proxy.ts` — route protection by role, block and expiry
- `supabase/` — schema, migrations and seed

This project runs Next.js 16, which differs from older versions. See `AGENTS.md` and `node_modules/next/dist/docs/` before changing routing, data fetching or config.
