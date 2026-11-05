# Setting up on Vercel and Supabase

A tick list for the live site. The code needs no changes for this setup: everything is settings and checks. Do the clicks in your own Vercel and Supabase accounts; never put keys or passwords in the code or in these docs.

## 1. Supabase (the launch project)

- [ ] Choose the project's region close to your candidates, and use the same region for Vercel (step 2).
- [ ] Database: run `supabase/schema.sql` once, then the production seed with the Superadmin's email and password hash (see the main README).
- [ ] Storage: three private buckets, `handbook-media`, `log-archives` and `handbook-audio` (see `operations.md`).
- [ ] Copy the **transaction pooler** connection string (port **6543**) from the project's Connect panel. Not the direct one on port 5432.
- [ ] Copy the project URL and the secret (service role) key for storage.
- [ ] Plan a database backup (daily backups on a paid plan, or a scheduled `pg_dump` kept elsewhere).

## 2. Vercel (the project)

- [ ] Node.js version 24 (`engines` in `package.json` asks for it).
- [ ] Function region: the same as the Supabase project.
- [ ] Environment variables for Production (Project → Settings → Environment Variables):

| Setting | Value |
| --- | --- |
| `DATABASE_URL` | the pooler string from step 1 (port 6543) |
| `DATABASE_POOL_MAX` | `2` |
| `JWT_SECRET` | a new long random value (e.g. `openssl rand -base64 48`), not the one used locally |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
| `SUPABASE_STORAGE_BUCKET`, `SUPABASE_ARCHIVE_BUCKET`, `SUPABASE_AUDIO_BUCKET` | only if the bucket names differ from the defaults |
| `GOOGLE_CLOUD_API_KEY`, `GEMINI_API_KEY` | keys on billed accounts |
| `HOST_REQUEST_LIMIT_MB` | leave unset (4.5 is Vercel's limit) |
| `STORAGE_LIMIT_MB` | leave unset on Supabase Free (900); raise it on a paid plan (e.g. `90000` on Pro) |

- [ ] Do **not** set `VOICE_PROVIDER` (the default is Google; `fake` is refused in production).
- [ ] Plan: Vercel Hobby is for non-commercial use only; check which plan fits.

## 3. After the first deployment

- [ ] Log in as the Superadmin. Backup & Restore says the database matches this version.
- [ ] Upload a picture on Media; open a Handbook page with pictures; play Listen audio.
- [ ] Download a backup.
- [ ] Office network: an Admin logs in from the office (allowed) and from outside (refused). This also confirms the visitor address is read correctly (`ipFromHeaders` in `lib/audit/log.ts`; Vercel sets the address itself, so no change is needed).
- [ ] A candidate on a real phone: log in, read, practise, start and finish a mock test.
- [ ] The server log has no warnings about `JWT_SECRET`, `HOST_REQUEST_LIMIT_MB` or `STORAGE_LIMIT_MB`.

## Optional before candidates use it

- **Database certificate check:** the connection is encrypted, but the portal doesn't yet check the database's certificate (`rejectUnauthorized: false` in `lib/db/pool.ts`). A small code change, using Supabase's certificate file, would add that check. It's on the go-live checklist.
