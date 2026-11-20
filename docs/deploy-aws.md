# Setting up on AWS (Amplify, RDS, S3, EventBridge)

The step-by-step list for a portal environment on AWS, in the London region (`eu-west-2`). The dev portal was set up this way in November 2026; production repeats it in its own account with **new** values. Do the clicks in the AWS console; never put keys or passwords in the code or in these docs.

What runs where: the site on **Amplify Hosting** (built from a GitHub branch), the database on **RDS PostgreSQL 17**, files in four private **S3** buckets, the daily database backup called by **EventBridge**. Google Cloud (translation, audio) and Gemini (Welsh audio) are unchanged.

## 1. Account

- [ ] Production: the employer's main account on the Paid plan; a monthly budget with email alerts.
- [ ] Root user: MFA on (two devices), no access keys, used only for account and billing tasks.
- [ ] Every screen: the region says **London**.

## 2. S3 (files)

- [ ] Four buckets, **Block all public access** on: pictures, archived login records, Handbook audio, database backups. Names are unique across AWS, so add an ending (e.g. `ycc-prod-handbook-media-x9q4`).
- [ ] CORS on the **pictures** and **audio** buckets: allow `GET` and `HEAD` from the site's address (the Backup page builds its zip in the browser). One entry per address; production allows only the production address.

## 3. RDS (database)

- [ ] PostgreSQL 17, db.t4g.micro to start, 20 GB gp3. Production: automated backups 7–35 days, deletion protection on, minor version upgrades on.
- [ ] Public access **Yes**: Amplify's servers can't join a private network and have no fixed addresses, so the security group allows PostgreSQL (5432) from `0.0.0.0/0`. That makes the hardening below required, not optional (or run the site on ECS instead; see `moving-to-aws.md`).
- [ ] Hardening (production):
  - the site's own login, `ycc_portal`, with rights only to the rows in the portal's tables (next step); the master login (`ycc_db_admin`) is never used by the site;
  - long random passwords for both logins (30+ characters, letters and numbers only, so they can go in `DATABASE_URL` as they are);
  - SSL is enforced by RDS and the portal checks the certificate by default (`DATABASE_SSL` unset or `verify`; never `no-verify`);
  - a CloudWatch alarm on repeated failed database logins.
- [ ] Load the schema with psql from your PC (on Windows run `\encoding UTF8` first): `supabase/schema.sql`, then the production seed with the Superadmin (see the main README). The `supabase/` folder name is historical; the files are plain Postgres.
- [ ] Create the site's login: run `supabase/limited-login.sql` once with psql **as `ycc_db_admin`**, giving the new password on the command line (it isn't stored in the file):

  ```
  psql "host=ENDPOINT port=5432 dbname=ycc user=ycc_db_admin sslmode=verify-full sslrootcert=C:/aws/global-bundle.pem" -v portal_password=NEWPASSWORD -f supabase/limited-login.sql
  ```

  `ycc_portal` can read, add, change and delete rows in every portal table (including tables later migrations add), and nothing else: it can't create, change, empty or delete tables, or make logins. Running the file again only sets a new password. **Migrations and `npm run restore-database` always run as `ycc_db_admin`** (with `ycc_portal` they're refused).
- [ ] `DATABASE_URL` uses `ycc_portal` and the endpoint **name** (`….eu-west-2.rds.amazonaws.com`), never its IP address: the certificate check needs the name.

## 4. The compute role (the site's permission for S3)

- [ ] IAM → Roles → Create role → **Custom trust policy**:

  ```json
  {"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"amplify.amazonaws.com"},"Action":"sts:AssumeRole"}]}
  ```

- [ ] No managed permissions; add an **inline policy** allowing only the four buckets (`s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on each bucket's objects, and `s3:ListBucket` on each bucket, which lets a missing file show as missing rather than refused).
- [ ] No access keys anywhere on AWS: the role gives the site temporary credentials by itself.

## 5. Amplify (the site)

- [ ] Amplify → Create new app → GitHub → the repository and the branch to deploy (dev: a branch of its own, so `main` is untouched).
- [ ] Build settings: "Edit YML file" shows the repo's `amplify.yml` (Node 24, `npm ci`, the settings copied into `.env.production`, `npm run build`). Leave "Password protect my site" off. Service role: let Amplify create one (it only writes logs).
- [ ] Environment variables (Advanced settings, or later Hosting → Environment variables):

| Setting | Value |
| --- | --- |
| `DATABASE_URL` | `postgresql://ycc_portal:PASSWORD@NAME.ID.eu-west-2.rds.amazonaws.com:5432/ycc` |
| `JWT_SECRET` | a new long random value |
| `CRON_SECRET` | a new long random value (16+ characters) |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | 32 random bytes in base64 (several copies of the site run; without it forms can fail after a redeploy) |
| `S3_REGION` | `eu-west-2` |
| `S3_MEDIA_BUCKET`, `S3_ARCHIVE_BUCKET`, `S3_AUDIO_BUCKET`, `S3_BACKUP_BUCKET` | the bucket names from step 2 |
| `GOOGLE_CLOUD_API_KEY`, `GEMINI_API_KEY` | keys on billed accounts |
| `DATABASE_POOL_MAX` | `3` |
| `TRUSTED_PROXY_HOPS` | `2` (Amplify's CloudFront adds one address after the visitor's) |

  Make secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

- [ ] Rules for settings:
  - only names listed in `amplify.yml` reach the running site; a new setting means adding its name there too;
  - **no `$` in any value** (Next.js reads `$NAME` as another setting);
  - names starting `AWS_` are reserved by Amplify: no access keys here;
  - leave `HOST_REQUEST_LIMIT_MB` (4.5, under Amplify's 5.72 MB response limit) and `STORAGE_LIMIT_MB` (about 20 GB) unset unless you want other values; don't set `VOICE_PROVIDER`;
  - a changed setting needs a **redeploy**.
- [ ] App settings → IAM roles → **Compute role** → the role from step 4; then Redeploy this version.
- [ ] Add the app's address (`https://BRANCH.ID.amplifyapp.com`, or the domain later) to the CORS rules from step 2.

## 6. EventBridge (the daily database backup)

Full steps in `database-backups.md` ("Setting up the daily schedule"). In short:

- [ ] Connection: API key, name `Authorization`, value `Bearer <CRON_SECRET>`.
- [ ] API destination: `GET https://<site address>/api/cron/database-backup`.
- [ ] Rule on the default bus, type Schedule, `cron(30 1 * * ? *)` (01:30 UTC), target the API destination, retries: maximum age 1 hour, 10 attempts.
- [ ] Optional: an email alarm on the rule's FailedInvocations.

## 7. After the first deployment

- [ ] Log in as the Superadmin. Backup & Restore says the database matches this version.
- [ ] Office Network → "Addresses seen by the server": your public address is **bold**. If not, change `TRUSTED_PROXY_HOPS` and redeploy.
- [ ] A login with a faked address is recorded with your real one (Activity → Logins). In PowerShell:

  ```
  '{"email":"nobody@example.com","password":"x"}' | Out-File -Encoding ascii body.json
  curl.exe -X POST https://<site address>/api/auth/login -H "Content-Type: application/json" -H "X-Forwarded-For: 203.0.113.9" -d "@body.json"
  ```

- [ ] Office network: an Admin from the office (allowed) and from mobile data (refused).
- [ ] Upload a picture on Media; open a Handbook page with pictures; play Listen audio.
- [ ] Download a content backup; make a database backup with Back Up Now.
- [ ] Stay logged in, redeploy: still logged in.
- [ ] Pages are compressed (browser F12 → Network → the page → `content-encoding: gzip` or `br`).
- [ ] The next day: the Backup tab lists a backup by "Daily schedule (automatic)" (times there are UK time).
- [ ] A candidate on a real phone: log in, read, practise, start and finish a mock test.
- [ ] Amplify → Monitoring → Hosting compute logs: no warnings about `JWT_SECRET`, `TRUSTED_PROXY_HOPS`, `HOST_REQUEST_LIMIT_MB`, `STORAGE_LIMIT_MB` or the database certificate.

## 8. Filling it

- [ ] Content: Backup & Restore → Restore (into the empty project), then each language's audio backup.
- [ ] By hand: General queries, the support contact, staff accounts; lock the structure again.

## When the domain arrives

- [ ] Amplify → Custom domains: add it; Amplify issues the certificate and shows the DNS records to add.
- [ ] Update the CORS rules and the EventBridge API destination to the new address.
- [ ] Repeat the checks in step 7.
