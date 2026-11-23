# Moving to AWS, and switching host later

## The move from Vercel and Supabase (done, November 2026)

The portal now runs on AWS only: the site on Amplify Hosting, the database on RDS PostgreSQL 17, files on S3, the daily backup called by EventBridge. Setting up an environment: `deploy-aws.md`. What changed in the code:

| Part | What changed | Where |
| --- | --- | --- |
| File storage | Amazon S3 (`S3_REGION`, `S3_*_BUCKET`); existence checks use `existingPaths`, since a signed link no longer proves a file exists. Keep `PICTURE_LINK_SECONDS` (`lib/content/book.ts`) within S3's limit (7 days). | `lib/storage/storage.ts` |
| Database certificate | Checked by default with AWS's RDS certificates (`DATABASE_SSL`); the restore script checks the same way. If AWS announces new RDS certificates, update the bundle. | `lib/db/ssl.mjs`, `lib/db/aws-rds-ca.mjs` |
| Visitor address | Read `TRUSTED_PROXY_HOPS` entries from the end of `X-Forwarded-For` (Amplify 2, ECS 1); earlier entries can be faked. Check Office Network → "Addresses seen by the server". | `lib/audit/visitor-address.ts` |
| Host sizes | `HOST_REQUEST_LIMIT_MB` 4.5 (under Amplify's 5.72 MB response limit); `STORAGE_LIMIT_MB` about 20 GB (S3 has no fixed size; a cost cap). | `lib/hosting.ts` |
| Build and settings | `amplify.yml` copies the listed settings into `.env.production` for the running site. | `amplify.yml` |
| Daily backup | EventBridge calls `/api/cron/database-backup`; "busy" answers 503 with `Retry-After`, so a retry is never counted as done too early. `vercel.json` removed. | `app/api/cron/database-backup/route.ts` |

Nothing uses Supabase Auth, its client library, Row-Level Security, Realtime or Edge Functions. The `supabase/` folder keeps its name for history; its files are plain Postgres.

## Switching from Amplify to ECS later

Why: Amplify can't reach a private database, so on Amplify the database is open to the internet (hardened: see `deploy-aws.md`). ECS can keep it reachable only from the portal, at about $50 a month more. The same RDS database and S3 buckets stay; about 1–2 days of work.

1. **Image and build:** a Dockerfile (Node 24, `npm ci`, `npm run build`, `npm start`) and a CodeBuild project from GitHub, pushing to ECR.
2. **Service:** ECS Express Mode (open "Additional configurations" before Create: port 3000, health check path, size, scaling). The same settings as on Amplify, best from Parameter Store (`/ycc/prod/…`, SecureString), except `TRUSTED_PROXY_HOPS=1` (the load balancer adds the visitor's address last). `DATABASE_POOL_MAX` can go up (long-running copies). `HOST_REQUEST_LIMIT_MB` may be raised.
3. **Permissions:** a task role with the same four-bucket policy as Amplify's compute role (no keys); the task execution role reads the settings.
4. **Database private:** security group inbound only from the service's security group (and you, briefly, for migrations); remove `0.0.0.0/0`.
5. **Address:** point the domain at the load balancer; update the S3 CORS rules and the EventBridge API destination.
6. **Check:** the "After the first deployment" list in `deploy-aws.md` (the visitor address and office network matter most). Keep the Amplify app until the ECS one has run cleanly for a while, then delete it.

Cost to watch on ECS: the load balancer (~$0.54 a day even idle), public IPv4 addresses ($0.005 an hour each), no NAT gateways.
