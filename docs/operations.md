# Operations

First-time setup is in the main `README.md` ("Getting started"). This page covers running the portal afterwards.

## Settings (`.env.local` locally, the host's environment settings in production)

`.env.example` lists every setting with a note. All are server-only: never prefix one with `NEXT_PUBLIC_`.

| Setting | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. On Supabase, the pooler string on port 6543. |
| `DATABASE_POOL_MAX` | Optional. Connections per running copy of the site (default 10; 1–3 on serverless hosting). |
| `HOST_REQUEST_LIMIT_MB` | Optional. The largest request or response the host lets through (default 4.5, Vercel Functions). Uploads, restores and backup downloads stay under it. Set it when moving to another host. |
| `STORAGE_LIMIT_MB` | Optional. Total storage cap for pictures, login archives and audio (default 900, for Supabase Free's 1 GB). Raise it when the storage plan grows, leaving a margin (e.g. 90000 on Supabase Pro). |
| `JWT_SECRET` | Long random value (at least 32 characters; e.g. `openssl rand -base64 48`). Changing it signs everyone out. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Storage access (Project Settings → API). |
| `SUPABASE_STORAGE_BUCKET`, `SUPABASE_ARCHIVE_BUCKET`, `SUPABASE_AUDIO_BUCKET` | Bucket names; default `handbook-media`, `log-archives`, `handbook-audio`. |
| `GOOGLE_CLOUD_API_KEY` | Google Cloud key restricted to Cloud Translation and Text-to-Speech (billed project). |
| `GEMINI_API_KEY` | Gemini key for Welsh audio (billed before candidates hear it). |
| `VOICE_PROVIDER` | `google` (default) or `fake` for local tests (refused in production). |
| `GEMINI_TTS_MODEL`, `GEMINI_TTS_VOICE`, `VOICE_READING_STYLE` | Optional overrides if Google renames Gemini's speech model or voices. |

## Storage buckets

Three **private** buckets: `handbook-media` (pictures), `log-archives` (archived login records, `application/gzip`), `handbook-audio` (Listen audio, `audio/mpeg`). Leave allowed file types open or allow those types. Total uploads are capped at 900 MB by default (`STORAGE_LIMIT_MB`, read in `lib/hosting.ts`).

## Database migrations

- New database: run `supabase/schema.sql` once, then `supabase/seed.sql` with the Superadmin's email and hash (`npm run hash -- "password"`). Skip the migration files.
- Existing database: `select name, applied_at from schema_migrations order by name;` shows what it has had. Run the missing files from `supabase/migrations/` in number order in the SQL editor. Backup & Restore shows the Superadmin whether the database matches the code.
- Before running a migration on the live database, take a database backup.

## Backups

- **Content backup** (Backup & Restore → Backup): one zip of the structure, pages, questions, languages and pictures. Not included: General queries, support contact, audio, accounts, candidates' data, logs.
- **Audio backups** (Backup → Audio backups): one file per language.
- **Restore** (Backup & Restore → Restore): only into an empty project. Afterwards re-enter General queries and the support contact, restore each language's audio backup, and lock the structure again.
- These are content backups, not database backups. Accounts, candidates' progress and logs need a database backup (a paid plan's daily backups or a scheduled `pg_dump` kept elsewhere).

## Login records

Activity → Archives: whole UK months older than 180 days can be archived by the Superadmin. Each month is saved to `log-archives` once, then its rows are deleted. The activity log itself is never trimmed.

## Office network (Admins)

Superadmin → Office Network: add the office's addresses (up to 20, single or range), then turn it on. Admins outside those addresses can't sign in or keep working; single Admins can be set to "Any network" on the Admins page. After any change of host, check the address reading (`ipFromHeaders` in `lib/audit/log.ts`) from the office and from outside.

## Languages and audio

- Add a language on Languages and Audio → Languages, from the built-in list (`lib/voice/language-catalogue.ts`). Make it live when its spoken phrases are checked.
- Batch Generate makes translations and audio for one chapter in one language per run; keep the page open while it runs.
- Each staff member has an hourly character allowance; monthly totals per service are shown for cost checks.

## Updating packages

- `npm ci` for everyday installs.
- Change a package on purpose (`npm install <package>@<version>`), then lint, build and test, and commit `package.json` and `package-lock.json` together.
- Check `npm audit` monthly; `npm audit fix` is fine, **never `npm audit fix --force`**. The minimatch warning in the lint tools is known and accepted (development only).
- When upgrading Next, read its upgrade guide in `node_modules/next/dist/docs/` first.

## Deployments

- A new deployment changes server-action ids: anyone mid-mock sees "Failed to find Server Action" until they reload (saved answers are safe). Prefer quiet hours or rolling deploys; set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` if more than one copy runs.
- Run any migration before deploying code that needs it.

## Troubleshooting

- **Changes don't show after unzipping a delivery**: old files are still there (unzipping never deletes). Run the delivery's `git rm` command, delete `.next`, and restart.
- **"Database: slow query" in the server log**: the line splits waiting for a connection from the query itself. Long waits mean the pool is too small or the database is far away.
- **Database status is amber** on Backup & Restore: migrations are missing (run them), the database is newer than the code (deploy the latest version), or the record table is missing (run 0043).
- **Logins paused**: the limits are 5 failures per email and address, 30 per address, and 300 site-wide, each for 15 minutes. They clear by themselves.
