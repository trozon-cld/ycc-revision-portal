# Go-live checklist

The working copy of this list is the "Final checklist (before go-live)" in the project plan; this is a summary for developers.

## Content

- [ ] Real content only: no placeholder sections, chapters, pages or questions, and no test accounts.
- [ ] A–D page 239 (needs a picture version of the multiple-answer question type).
- [ ] Placeholder pictures replaced with our own designs.
- [ ] Spoken phrases checked by a speaker of each language; a Welsh speaker listens to Welsh audio; Hindi and Punjabi labels checked by a reader.
- [ ] FAQ wording reviewed.

## Launch project

- [ ] A clean production `schema.sql` and seed (only the required rows: support contact row, English and its spoken phrases, the Superadmin).
- [ ] Content moved with Backup → Restore; each language's audio backup restored.
- [ ] General queries, support contact and staff accounts entered again; structure locked again.
- [ ] Database status on Backup & Restore says it matches this version.

## Hosting

- [ ] Host chosen; the site in the same region as the database.
- [ ] Visitor address: `ipFromHeaders` (`lib/audit/log.ts`) matches the host (Vercel: as is; AWS behind a load balancer: the last entry). Login limits and the office network depend on it.
- [ ] Office network tested from the office and from outside.
- [ ] `HOST_REQUEST_LIMIT_MB` matches the host's request limit (default 4.5 for Vercel). **Moving off Vercel: set it to the new host's limit.**
- [ ] `STORAGE_LIMIT_MB` fits the storage plan (default 900 for Supabase Free). **Upgrading Supabase or changing storage provider: raise it, leaving a margin (e.g. 90000 on Pro's 100 GB).**
- [ ] Host request time limit enough for audio generation and backups.
- [ ] Database: the pooler connection string, `DATABASE_POOL_MAX` 1–3 on serverless, and the database certificate verified (`lib/db/pool.ts`, `rejectUnauthorized: false` today).
- [ ] A long random `JWT_SECRET`; all keys set in the host's settings, none in the code.
- [ ] Pages sent compressed (gzip or Brotli).
- [ ] `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` if more than one copy runs.
- [ ] A database backup plan (paid daily backups or a scheduled `pg_dump` kept elsewhere).
- [ ] Free-tier limits understood (e.g. Vercel Hobby is non-commercial only; Supabase Free's 5 GB egress is the likely first limit, mostly picture downloads).

## Listen

- [ ] Billing on the Google Cloud project and the Gemini key before candidates hear audio.
- [ ] Tested on real phones (iPhone and Android).

## Last checks

- [ ] `npm audit` run again; `npm run lint` and `npm run build` clean.
- [ ] A full walk-through as Superadmin, Admin and candidate on the live site.

## After launch (parked)

- Keep unsaved editor work in the browser; picture links lasting longer for the staff editor; a full Content-Security-Policy.
- Faster Activity paging when the logs get large; caching signed picture links to cut downloads.
- Automated tests in the repo and CI.
