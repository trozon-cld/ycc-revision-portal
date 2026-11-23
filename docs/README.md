# Project docs

For anyone working on the YCC Revision Portal later. The main `README.md` covers setup and the folder map; these pages hold the reasons and the routines.

- [architecture.md](architecture.md): how the portal fits together (roles, content model, sign-in and guards, storage, voice services, UI rules).
- [decisions.md](decisions.md): the key decisions and why, with dates.
- [conventions.md](conventions.md): code rules every change follows.
- [operations.md](operations.md): running it: settings, buckets, migrations, backups, languages, office network, packages, troubleshooting.
- [go-live-checklist.md](go-live-checklist.md): what to settle before and at launch.
- [deploy-aws.md](deploy-aws.md): the step-by-step setup on AWS (S3, RDS, Amplify, EventBridge) and the checks after deploying.
- [database-backups.md](database-backups.md): the daily database backup, Back Up Now, and how to restore one.
- [moving-to-aws.md](moving-to-aws.md): what changed in the move to AWS, and how to switch from Amplify to ECS later.

Keep these up to date when something changes. No secrets, passwords or keys go in these files.
