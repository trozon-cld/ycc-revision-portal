# Moving to AWS (or another provider) later

The portal was built so a move touches only a few known places. Pages, logins, content, tests and the rest of the code stay as they are. Rough size: 2–3 working days including testing, mostly the storage rewrite and copying files.

| Part | What changes | Where |
| --- | --- | --- |
| Database | Copy it with `pg_dump` / restore to RDS or Aurora (Postgres; the only extension is `pgcrypto`), then set the new `DATABASE_URL`. | settings only |
| Connection sharing | Use RDS Proxy or PgBouncer in place of Supabase's pooler; keep `DATABASE_POOL_MAX` small if the site runs as many copies. | setup |
| Database certificate | Check the database's certificate with AWS's certificate file. | `lib/db/pool.ts` |
| File storage | Rewrite the three storage functions (upload, delete, signed links) with S3, copy the three buckets' files, rename the settings. Keep `PICTURE_LINK_SECONDS` (`lib/content/book.ts`) within S3's limit (7 days). | `lib/storage/storage.ts` only |
| Visitor address | Behind an AWS load balancer the real address is the **last** entry of `x-forwarded-for`, not the first. Login limits and the office network depend on it. | `ipFromHeaders` in `lib/audit/log.ts` |
| Request size | Set `HOST_REQUEST_LIMIT_MB` to the new host's limit. | setting |
| Storage cap | Set `STORAGE_LIMIT_MB` to fit the new storage plan. | setting |
| Several copies of the site | Set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` so all copies accept the same forms; deploy without stopping everyone at once. | setting |
| Compression | Make sure pages are sent compressed (gzip or Brotli). | host setup |
| Region | Site and database in the same region. | host setup |
| Backups | Turn on the database's automated backups. | host setup |

## Order of work

1. Set up the new database and storage; copy the data and files.
2. Make the code changes above in a test copy; run the full regression.
3. Deploy, with the settings, to the new host.
4. Run the "After the first deployment" checks in `deploy-vercel-supabase.md` (the office network test matters most).
5. Switch the web address over; keep the old setup until the new one has run cleanly for a while.

Nothing here uses Supabase Auth, its client library, Row-Level Security, Realtime or Edge Functions, so there is nothing else to replace.
