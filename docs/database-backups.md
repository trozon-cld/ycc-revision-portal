# Database backups

Everything in the database, saved as one compressed file: accounts and password hashes, candidates' progress and results, the activity log and login records, content, translations and settings. Pictures and audio files are not in it; they're covered by the content backup and the audio backups (Backup & Restore → Backup).

## How it works

- **Daily, automatically:** the host's scheduler calls `/api/cron/database-backup` with `Authorization: Bearer <CRON_SECRET>` (on AWS an EventBridge rule, set up as below; once a day at 01:30 UTC). The link stays closed until `CRON_SECRET` is set, makes at most one backup in 20 hours however often it's called, and answers "busy, try again in 5 minutes" (503, `Retry-After`) while another backup is still being made, so a retry is never counted as done too early.
- **By hand:** Backup & Restore → Backup → **Back Up Now** makes one at once and downloads it. Up to 10 in 24 hours.
- **Where:** the private bucket `db-backups` (setting `S3_BACKUP_BUCKET`), through `lib/storage/storage.ts`. The list is the `database_backups` table.
- **Copies kept:** the newest 7 automatic ones, the first of each week for 4 weeks, and the last 5 made by hand. Older files are deleted after each backup.
- **Space:** the files count towards the storage cap (`STORAGE_LIMIT_MB`). Expect about 1–3 MB per backup at first.
- **Logged:** every backup (the daily one as "Daily schedule (automatic)") and every download.
- **Code:** `lib/database-backup/` (`make.ts` reads every table in one consistent snapshot; `format.ts` has the limits), the cron route in `app/api/cron/database-backup/`, the restore script in `scripts/restore-database.mjs`.

**Habit:** download one about once a week and keep it outside AWS (your computer and a cloud drive). The files hold emails and password hashes: keep them private.

## Setting up the daily schedule (AWS EventBridge)

EventBridge waits at most 5 seconds for an answer and then tries again; that's fine here (one backup per 20 hours, one at a time). London region, three parts:

1. **Connection** (EventBridge → API destinations → Connections → Create): authorisation type **API key**; key name `Authorization`; value `Bearer ` followed by the site's `CRON_SECRET`. EventBridge keeps it in Secrets Manager.
2. **API destination** (API destinations → Create): endpoint `https://<site address>/api/cron/database-backup`, method **GET**, the connection above, invocation rate 1 per second.
3. **Rule** (Rules → Create, default event bus, type **Schedule**, the older "scheduled rule" option, not EventBridge Scheduler): cron `30 1 * * ? *` (01:30 UTC every day); target **EventBridge API destination** → the one above; let it create its role; retry policy: maximum age of event **1 hour**, retry attempts **10**.

Optional: a CloudWatch alarm on the rule's **FailedInvocations** (sum ≥ 1 in a day) emailing through SNS. Check the next day: Backup & Restore → Backup lists a new backup made by "Daily schedule (automatic)". When the site address changes (a domain, or moving host), update the API destination's endpoint.

## Restoring a database backup

A database backup isn't restored from inside the portal: if the database is lost, the site can't run. Restore it into a **fresh** database and point the site at it.

1. **Make the new database.** A new RDS PostgreSQL 17 database (or any Postgres). Run `supabase/schema.sql` from the version of the code that made the backup (the backup's list on the Backup tab shows its database version, e.g. 0044). **Don't** run the seed: the backup brings its own accounts.
2. **Create the storage buckets** if they're lost too: four private S3 buckets (pictures, login archives, audio, database backups; see `S3_*` in `operations.md`).
3. **Load the backup** from your copy of the project folder (with `npm ci` done), using the new database's connection string (its RDS endpoint name, port 5432). The certificate is checked as on the site (`DATABASE_SSL`); `sslmode=disable` in the string is only for a local database without SSL:

   ```bash
   DATABASE_URL="postgresql://ycc_db_admin:…@ycc-….eu-west-2.rds.amazonaws.com:5432/ycc" npm run restore-database -- ycc-database-2026-11-06-0130-daily.json.gz
   ```

   On Windows PowerShell: `$env:DATABASE_URL="…"; npm run restore-database -- file.json.gz`.

   It refuses a database that already has accounts or is at another migration, loads every table in one transaction (all or nothing), and prints each table's row count.
4. **Point the site at it:** set `DATABASE_URL` and the storage settings on the host to the new database and buckets, then redeploy.
5. **Put back the files:** if the old project's pictures and audio are lost too, log in as the Superadmin and use Backup & Restore → Restore → **Put back missing files**: choose the content backup (pictures), then each language's audio backup. It uploads only files the database lists and storage lacks, never changes data and never replaces a file; it names any file the backup doesn't have (for example, a picture added after that backup was made).
6. **Check:** log in as the Superadmin and as a candidate; Backup & Restore shows the database version matches; make a backup with Back Up Now.

The list of backups starts empty in the new database (the old files belong to the old project).

## Before go-live

Practise once: download a backup, restore it into a spare Supabase project with the steps above, log in there and look around, then delete the spare project.
