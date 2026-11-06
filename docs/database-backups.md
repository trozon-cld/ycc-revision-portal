# Database backups

Everything in the database, saved as one compressed file: accounts and password hashes, candidates' progress and results, the activity log and login records, content, translations and settings. Pictures and audio files are not in it; they're covered by the content backup and the audio backups (Backup & Restore → Backup).

## How it works

- **Daily, automatically:** the host's scheduler calls `/api/cron/database-backup` with `Authorization: Bearer <CRON_SECRET>` (on Vercel, `vercel.json` sets this up; it runs once a day at about 01:30 UTC). The link stays closed until `CRON_SECRET` is set, and makes at most one backup in 20 hours however often it's called.
- **By hand:** Backup & Restore → Backup → **Back Up Now** makes one at once and downloads it. Up to 10 in 24 hours.
- **Where:** the private bucket `db-backups` (setting `SUPABASE_BACKUP_BUCKET`), through `lib/storage/storage.ts`. The list is the `database_backups` table.
- **Copies kept:** the newest 7 automatic ones, the first of each week for 4 weeks, and the last 5 made by hand. Older files are deleted after each backup.
- **Space:** the files count towards the storage cap (`STORAGE_LIMIT_MB`). Expect about 1–3 MB per backup at first.
- **Logged:** every backup (the daily one as "Daily schedule (automatic)") and every download.
- **Code:** `lib/database-backup/` (`make.ts` reads every table in one consistent snapshot; `format.ts` has the limits), the cron route in `app/api/cron/database-backup/`, the restore script in `scripts/restore-database.mjs`.

**Habit:** download one about once a week and keep it outside Supabase (your computer and a cloud drive). The files hold emails and password hashes: keep them private.

## Restoring a database backup

A database backup isn't restored from inside the portal: if the database is lost, the site can't run. Restore it into a **fresh** database and point the site at it.

1. **Make the new database.** A new Supabase project (or any Postgres). Run `supabase/schema.sql` from the version of the code that made the backup (the backup's list on the Backup tab shows its database version, e.g. 0044). **Don't** run the seed: the backup brings its own accounts.
2. **Create the storage buckets** in the new project: `handbook-media`, `log-archives`, `handbook-audio`, `db-backups` (all private).
3. **Load the backup** from your copy of the project folder (with `npm ci` done), using the new database's **direct** connection string (port 5432, the `postgres` user), not the pooler:

   ```bash
   DATABASE_URL="postgresql://postgres:…@db.….supabase.co:5432/postgres" npm run restore-database -- ycc-database-2026-11-06-0130-daily.json.gz
   ```

   On Windows PowerShell: `$env:DATABASE_URL="…"; npm run restore-database -- file.json.gz`.

   It refuses a database that already has accounts or is at another migration, loads every table in one transaction (all or nothing), and prints each table's row count.
4. **Point the site at it:** set `DATABASE_URL` (the pooler string, port 6543) and the storage settings on the host to the new project, then redeploy.
5. **Put back the files:** if the old project's pictures and audio are lost too, log in as the Superadmin and use Backup & Restore → Restore → **Put back missing files**: choose the content backup (pictures), then each language's audio backup. It uploads only files the database lists and storage lacks, never changes data and never replaces a file; it names any file the backup doesn't have (for example, a picture added after that backup was made).
6. **Check:** log in as the Superadmin and as a candidate; Backup & Restore shows the database version matches; make a backup with Back Up Now.

The list of backups starts empty in the new database (the old files belong to the old project).

## Before go-live

Practise once: download a backup, restore it into a spare Supabase project with the steps above, log in there and look around, then delete the spare project.
