# YCC Revision Portal

Revision platform for construction site workers preparing for the CITB HS&E test — designed to help them prepare with confidence.

Status: in active development.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS v4)
- PostgreSQL on Supabase (raw SQL via `pg`), plus Supabase Storage for pictures, log archives and Handbook audio
- Handbook translations and audio through Google Cloud Translation and Text-to-Speech, Welsh audio through the Gemini API (plain `fetch`); MP3 encoding with `@breezystack/lamejs`
- Custom JWT auth (jose + bcryptjs, HTTP-only cookies)

## Roles

- **Superadmin** — manages Admins, test areas and test types, the Handbook, question bank and media, and sees all candidates and logs.
- **Admin** — creates and manages candidates, each with an assigned test type and an access expiry.
- **Candidate** — logs in with an allotted credential and revises one test type at a time, starting with the assigned one; they can switch within its test area.

## Content model

- **Test area** (`test_areas`, e.g. General, Specialist): candidates switch only between test types of the same test area.
- **Test type** (`test_types`, e.g. Operative, Supervisory): what a candidate is assigned and studies. Their Handbook, Practice, mock tests, progress, covers and Listen all follow their current test type.
  Test types keep a set order within their test area (`position`, Move up / Move down on the Test types page), used wherever they are listed.
- **Numbers on screen** are never stored in titles: section letters come from section order; chapter numbers are fixed (01–28) in staff lists and counted within the book a candidate studies (`numberedChapters` in `lib/handbook/structure.ts`), so a specialist chapter is 17.
- **Chapter** (`chapters`, in `sections` A–E): a topic in the book, linked to every test type that includes it (`test_type_chapters`). The core chapters (A–D) are in every test type; each specialist chapter (E) only in its own.
- **Bulk upload** (migration 0039): pages and questions from a batch keep a `source_key` (e.g. `AD-p012` = A–D PDF page 12), pictures their batch file name (`source_name`) and a SHA-256 fingerprint, so a re-upload updates instead of duplicating. The key is shown as "Source: A–D PDF p12" in the editors and found by the Question bank search (`p12`, `AD-p012`). The batch format is described in the data folder's `format-sample/FORMAT.md`. Import saves a checked batch in one go: pictures first (a new name is added, the same file is skipped, a changed file under a known name replaces the old one everywhere it's used), then pages and questions in one transaction. New items come in as drafts; updated items keep their ids and their published/draft status. Items already in a chapter keep their place; new ones go after the batch item before them. Logged as "Imported content" (once per import), "Uploaded picture" (from bulk upload) and "Replaced picture". The page is Backup & Restore → Upload content (`/admin/backup`; the old `/admin/handbook/upload` redirects).
- **Backup** (Backup & Restore → Backup, Superadmin only): one zip (`ycc-backup-<UK date>-<time>.zip`) of `manifest.json` (format `ycc-backup` v1, each table's columns and row count), `languages.json`, `structure.json`, `content.json` (each table's rows exactly as stored: ids, Q numbers, statuses, drawn areas, Handbook order, translations; dates as exact UTC text; links to staff accounts left out) and `pictures/` (each stored picture and thumbnail at its storage path). The server reads everything in one read-only snapshot and sends it gzipped (`/api/content/backup`); the browser fetches the pictures by short-lived links and builds the zip with fflate, then reports it saved (`/api/content/backup/saved`), which writes the one log entry "Downloaded backup". Not included: General queries, support contact, audio, accounts, candidates' data, logs. A missing picture stops the backup.
- **Restore** (Backup & Restore → Restore, Superadmin only): only into an empty project (no pages, questions or pictures). The browser opens the zip; `/api/content/restore/check` checks the manifest (format, version, columns against this database), that the project is empty, that no candidate account uses a test type missing from the backup, and storage room; each picture file goes to `/api/content/restore/picture?path=media/…` (a real picture at a portal-shaped path, only while the project has no pictures; same path, so a retry overwrites); then the data, gzipped, to `/api/content/restore`, saved in one transaction: rows exactly as stored (ids, Q numbers, statuses), the project's structure replaced by the backup's (rows not in it removed), languages added or updated, every page and question checked with the portal's own rules, every picture checked present in storage; the Q-number counter carries on after the highest; one log entry "Restored backup". Staff links (who made or checked items) come back blank. For testing on a project with content, `setup/3-clear-content.sql` in the data folder empties it (only within 24 hours of a downloaded backup).
- Before migration 0037 test areas were "category groups" and test types "categories". Activity entries written before it keep their old action keys (`category.*`, `category_group.*`); `lib/audit/actions.ts` maps them to today's.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` (Supabase pooler string) and `JWT_SECRET`. `DATABASE_POOL_MAX` is optional (default 10; use 1–3 on serverless hosting).

3. In the Supabase SQL editor, run `supabase/schema.sql` for a fresh database. The files in `supabase/migrations/` are changes for databases created from an earlier version of the schema, so skip them on a fresh setup. A fresh database has English only; add the other Listen languages on Languages and audio → Languages.

4. For the image library (Admin → Media), in Supabase:
   - **Storage → New bucket**, name `handbook-media`, **Public bucket off** (pictures are served through short-lived signed links).
   - Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API; the secret or legacy service_role key) to `.env.local`. They are server-only; never prefix them with `NEXT_PUBLIC_`.
   - **Storage → New bucket**, name `log-archives`, **Public bucket off**, for archived login records (Activity → Archives). Leave its allowed file types open, or allow `application/gzip`.
   - **Storage → New bucket**, name `handbook-audio`, **Public bucket off**, for Handbook audio (MP3). Leave its allowed file types open, or allow `audio/mpeg`.
   - For Handbook translations and audio, add `GOOGLE_CLOUD_API_KEY` to `.env.local`, and `GEMINI_API_KEY` for Welsh audio (server only; see `.env.example`). Use billed keys before candidates hear any audio.

5. Generate the Superadmin password hash, paste it and the email into `supabase/seed.sql`, then run that file:

   ```bash
   npm run hash -- "YourStrongPassword"
   ```

6. Start the dev server and open [http://localhost:3000](http://localhost:3000):

   ```bash
   npm run dev
   ```

7. Before delivering a change, `npm run lint` should report nothing (Next's lint setup, including React's hook rules).

## Project structure

- `app/` — routes:
  - `/login`, `/access-expired`
  - `/admin/*` (Admin/Superadmin): `/admin/candidates` (`[id]` a candidate's progress, read only), `/admin/admins`, `/admin/test-types` (test areas and test types; the old `/admin/categories` redirects), `/admin/handbook` (sections and chapters; `chapters/[id]` a chapter's pages and questions; `pages/[id]` the page editor (with each language's translation and audio), `pages/[id]/translations` its translations; `preview` the book as candidates see it; `languages` every text page's and question page's translation and audio state (Pages tab), `languages/manage` the Languages tab (add a language from the built-in list, make it live, hide it, show it again, delete a hidden one (Superadmin); `[code]` its spoken phrases)), `/admin/questions` (bank; `new`, `[id]` (with Listen languages for Handbook questions), `[id]/translations` the question's translations), `/admin/media`, `/admin/faq` (General queries and support contact details; Superadmin only), `/admin/backup` (Backup & Restore: Upload content checks a batch zip, then imports it on request; `download` Backup and `restore` Restore, Superadmin only), `/admin/activity` (actions, logins and login-record archives), `/admin/account`
  - `/dashboard` (Candidate home): `test-type` to switch within the test area (the old `category` address redirects), `prepare` the Handbook, `practice` Practice setup and `practice/[id]` a run or its report, `mock` the Mock test start page and `mock/[id]` a test (its results and `review` once ended), `progress` My progress, `account` (details, listening language, sign-ins), `help` (also Log out of all devices)
  - `/api/auth/login`, `/api/auth/logout` (also "log out of all devices"), `/api/media/upload` (picture uploads: sign-in, origin and size are checked before the file is read), `/api/content/check` (bulk upload check: the same checks before reading; the browser opens the zip and sends content.json and the picture list), `/api/content/picture` (one picture of a bulk upload, prepared in the browser as on the Media page; the same checks), `/api/content/import` (saves a checked batch; the same checks), `/api/content/backup` (backup data, Superadmin; read only) and `/api/content/backup/saved` (logs a finished backup), `/api/content/restore/check`, `/api/content/restore/picture` and `/api/content/restore` (restore, Superadmin; see Restore above), `/api/handbook/audio/[itemId]` (Listen: checks the candidate's live sign-in, test type and up-to-date audio in their listening language, then sends the browser to a short-lived private link)
- `components/admin/` — compact admin console UI (sidebar shell, tables, row menus, slide-in panels, `ActionForm`, `Pagination`); admin pages must build from these. Candidate pages keep the large, simple style.
- `components/candidate/` — candidate page shell (header, `PageBody`), home-screen section cards and the shared candidate styles (`buttons.ts`: buttons, cards, choice rows, badges, bars, error box)
- `components/icons.tsx` — every icon in the app (Phosphor Icons, MIT licence), used as `<Icon name="…" />`; colours are the named set in `app/globals.css`
- `components/use-latest.ts`, `components/use-browser-value.ts` — shared client hooks: the latest value for handlers and effects; values only the browser knows (address, saved on/off choices)
- `components/learning/` — candidate-facing renderers: blocks, questions (`questions/`), the fixed-page book reader, the reader bar/Settings, and the focused frame shared by Practice and the Mock test (`focused-shell.tsx`)
- `lib/auth/` — JWT signing/verification, session cookie, role guard, login and record limits, who edits content (`content-editors.ts`), small-request checks
- `lib/audit/` — activity and login logs (every loggable action is listed in `lib/audit/actions.ts`) and login-record archiving
- `lib/db/` — shared Postgres pool, transaction helper, LIKE escaping
- `lib/users/` — display-name and sign-in (email/password) rules shared by account, admin and candidate forms
- `lib/candidates/` — access dates (UK time), test type switching, the candidate home, and one candidate for staff (`detail.ts`, `paths.ts`)
- `lib/content/import/` — bulk upload: the batch format (`format.ts`, browser-safe), the check against the portal and the database (`check.ts`), item conversion to the portal's shapes (`convert.ts`), the browser zip reader (`zip.ts`, fflate), picture import (`pictures.ts`), the import itself (`run.ts`) and limits
- `lib/content/backup/` — Backup & Restore: who sees which tab (`access.ts`), the backup format (`format.ts`, browser-safe), reading the snapshot and logging (`export.ts`, server), building the zip (`zip.ts`, browser), opening a backup and running a restore (`open.ts`, browser), the restore itself (`restore.ts`, server) and sizes (`limits.ts`)
- `lib/handbook/` — Handbook structure (sections, chapters, locks) and chapter–test type links
- `lib/content/` — Handbook page blocks (types, validation, **bold** markup), book sheet rules and the book loaders
- `lib/questions/` — question types (`types/`), validation, server-side marking, the safe client shape, shuffling, bank queries and the Practice/Mock question pool (`pool.ts`)
- `lib/practice/` — Practice: Smart practice picking, runs and reports (server-marked)
- `lib/mock/` — Mock test: the draw (50 questions spread across chapters), tests in progress, deadline and marking
- `lib/faq/` — General queries: questions in order and the support contact details (`types.ts` safe in forms)
- `lib/progress/` — candidates' progress per test type (Handbook pages done, question results), the My progress overview and the readiness score (`readiness.ts`, pure); not activity-log data
- `lib/storage/` — the only code that talks to the storage provider (upload, delete, signed links; pictures, archive and audio buckets) and the total stored (`usage.ts`, for the storage cap)
- `lib/voice/` — Handbook translations and audio: languages (kept in the database, read through `language-store.ts`; the list of languages that can be added is `language-catalogue.ts` (one line each); managing them is `language-admin.ts`, the spoken phrases' rules `phrases.ts`), what is read aloud, translation checks, saving translations (`page-translations.ts`), page audio (`page-audio.ts`; the audio files themselves in `audio-files.ts`), question pages' translations and audio (`question-voice.ts`, shared parts in `question-listen.ts`), the Handbook-wide list (`overview.ts`), what candidates hear and their listening language (`listen.ts`), the voice services behind `services.ts` (Google Cloud Translation and Text-to-Speech in `google.ts`; Gemini in `gemini.ts` for languages the list gives to it (Welsh audio); a stand-in in `fake.ts`), MP3 encoding and each staff member's hourly allowance in characters (`quota.ts`, with monthly totals per service)
- `lib/media/` — image checks (real type and size from the file), in-browser WebP conversion, saving uploads and the storage cap (`upload.ts`)
- `lib/ids.ts`, `lib/text.ts`, `lib/format.ts`, `lib/limits.ts`, `lib/forms.ts`, `lib/params.ts` — small shared helpers (id checks, text clean-up, display formats, length limits, form results, URL parameters)
- `lib/brand.ts`, `lib/layout.ts` — logo and phone screen sizes
- `proxy.ts` — route protection by role, block and expiry
- `scripts/` — `generate-hash.mjs` (`npm run hash`)
- `supabase/` — schema, migrations and seed

This project runs Next.js 16, which differs from older versions. See `AGENTS.md` and `node_modules/next/dist/docs/` before changing routing, data fetching or config.

## Third-party licences

MP3 encoding uses LAME through `@breezystack/lamejs` (LGPL-3.0; https://lame.sourceforge.io), used unmodified as a separate package. Icons: Phosphor Icons (MIT).
