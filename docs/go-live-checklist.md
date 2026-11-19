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

- [ ] Set up with `deploy-aws.md` (Amplify, RDS, S3, EventBridge, all in London), including its "After the first deployment" checks.
- [ ] Database on Amplify is open to the internet: the hardening in `deploy-aws.md` done (separate portal login, long password, failed-login alarm), or the site moved to ECS (`moving-to-aws.md`).
- [ ] Visitor address: `TRUSTED_PROXY_HOPS` matches the host (default 1, the last `X-Forwarded-For` entry; check Office Network → "Addresses seen by the server", and that a login with a faked `X-Forwarded-For` is recorded with the real address). Login limits and the office network depend on it.
- [ ] Office network tested from the office and from outside.
- [ ] `HOST_REQUEST_LIMIT_MB` fits the host (default 4.5: under Amplify's 5.72 MB response limit; ECS may raise it).
- [ ] `STORAGE_LIMIT_MB` is the storage cost cap wanted (default 20000, about 20 GB on S3; uploads and new audio stop there).
- [ ] Host request time limit enough for audio generation and backups.
- [ ] Database: the endpoint name in `DATABASE_URL`, `DATABASE_POOL_MAX` 3 on Amplify, and the certificate checked (`DATABASE_SSL` unset or `verify`; never `no-verify`).
- [ ] A long random `JWT_SECRET`; all keys set in the host's settings, none in the code.
- [ ] Pages sent compressed (gzip or Brotli).
- [ ] `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` set (Amplify and ECS run several copies); new for production, no `$`.
- [ ] Database backups: `CRON_SECRET` set (in Amplify and the EventBridge connection), the backups bucket made, the EventBridge rule running, the daily backup seen on the Backup tab, and one practice restore done (`database-backups.md`).
- [ ] AWS on the Paid plan with a budget and alerts; costs understood (Amplify ~$20–25 a month in total with RDS and S3).

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
