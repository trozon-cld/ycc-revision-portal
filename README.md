# YCC Revision Portal

Revision platform for construction site workers preparing for the CITB HS&E test — designed to help them prepare with confidence.

Status: in active development.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- PostgreSQL on Supabase (raw SQL via `pg`), plus Supabase Storage for pictures and log archives
- Custom JWT auth (jose + bcryptjs, HTTP-only cookies)

## Roles

- **Superadmin** — manages Admins, category groups and categories, the Handbook, question bank and media, and sees all candidates and logs.
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
   - **Storage → New bucket**, name `log-archives`, **Public bucket off**, for archived login records (Activity → Archives). Leave its allowed file types open, or allow `application/gzip`.

5. Generate the Superadmin password hash, paste it and the email into `supabase/seed.sql`, then run that file:

   ```bash
   npm run hash -- "YourStrongPassword"
   ```

6. Start the dev server and open [http://localhost:3000](http://localhost:3000):

   ```bash
   npm run dev
   ```

## Project structure

- `app/` — routes:
  - `/login`, `/access-expired`
  - `/admin/*` (Admin/Superadmin): `/admin/candidates`, `/admin/admins`, `/admin/categories`, `/admin/handbook` (sections and chapters; `chapters/[id]` a chapter's pages and questions; `pages/[id]` the page editor; `preview` the book as candidates see it), `/admin/questions` (bank; `new`, `[id]`), `/admin/media`, `/admin/activity` (actions, logins and login-record archives), `/admin/account`
  - `/dashboard` (Candidate home): `category` to switch within the group, `prepare` the Handbook, `practice` Practice setup and `practice/[id]` a run or its report, `mock` the Mock test start page and `mock/[id]` a test (its results and `review` once ended), `progress` My progress, `help`
- `components/admin/` — compact admin console UI (sidebar shell, tables, row menus, slide-in panels, `ActionForm`, `Pagination`); admin pages must build from these. Candidate pages keep the large, simple style.
- `components/candidate/` — candidate page shell (header, `PageBody`), home-screen section cards and the shared large button styles
- `components/learning/` — candidate-facing renderers: blocks, questions (`questions/`), the fixed-page book reader, the reader bar/Settings, and the focused frame shared by Practice and the Mock test (`focused-shell.tsx`)
- `lib/auth/` — JWT signing/verification, session cookie, role guard, login limits
- `lib/audit/` — activity and login logs (every loggable action is listed in `lib/audit/actions.ts`) and login-record archiving
- `lib/db/` — shared Postgres pool, transaction helper, LIKE escaping
- `lib/users/` — display-name and sign-in (email/password) rules shared by account, admin and candidate forms
- `lib/candidates/` — access dates (UK time), category switching and the candidate home
- `lib/handbook/` — Handbook structure (sections, chapters, locks) and chapter–category links
- `lib/content/` — Handbook page blocks (types, validation, **bold** markup), book sheet rules and the book loaders
- `lib/questions/` — question types (`types/`), validation, server-side marking, the safe client shape, shuffling, bank queries and the Practice/Mock question pool (`pool.ts`)
- `lib/practice/` — Practice: Smart practice picking, runs and reports (server-marked)
- `lib/mock/` — Mock test: the draw (50 questions spread across chapters), tests in progress, deadline and marking
- `lib/progress/` — candidates' progress per category (Handbook pages done, question results), the My progress overview and the readiness score (`readiness.ts`, pure); not activity-log data
- `lib/storage/` — the only code that talks to the storage provider (upload, delete, signed links; pictures and archive buckets)
- `lib/media/` — image checks (real type and size from the file) and in-browser WebP conversion
- `lib/ids.ts`, `lib/text.ts`, `lib/format.ts`, `lib/limits.ts`, `lib/forms.ts`, `lib/params.ts` — small shared helpers (id checks, text clean-up, display formats, length limits, form results, URL parameters)
- `lib/brand.ts`, `lib/layout.ts` — logo and phone screen sizes
- `proxy.ts` — route protection by role, block and expiry
- `scripts/` — `generate-hash.js` (`npm run hash`)
- `supabase/` — schema, migrations and seed

This project runs Next.js 16, which differs from older versions. See `AGENTS.md` and `node_modules/next/dist/docs/` before changing routing, data fetching or config.
