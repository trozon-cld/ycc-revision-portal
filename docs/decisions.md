# Key decisions

The decisions most likely to be questioned later, newest areas last. Dates are 2026.

## Platform

- **Own JWT sign-in, not Supabase Auth** (deliberate): keeps the database plain Postgres and the provider replaceable.
- **Plain Postgres and one storage file** (`lib/storage/storage.ts`): no Supabase client, RLS, Realtime or Edge Functions, so a move (e.g. to AWS) stays small.
- **Host not fixed** at the time of writing; host-dependent items are kept in the go-live checklist.
- **UK time** (Europe/London) for access dates and archive months.
- **Supabase free tier in mind**: compact candidate data (counters and short codes), server-paginated lists, old practice runs trimmed (newest 20 kept), only the newest 10 mock tests keep their answers.
- **Node 24 and `npm ci`** (5 Nov); packages changed only on purpose; never `npm audit fix --force`.
- **Migration record** (5 Nov, migration 0043): `schema_migrations` lists what each database has had, and the Superadmin sees on Backup & Restore whether it matches the code.

## Access

- **Content editing is Superadmin-only for launch** (13 Oct); one setting (`CONTENT_EDITORS`) opens it to Admins later.
- **Expiry and blocking apply to candidates only**; staff never expire.
- **Office network for Admins only** (3 Nov, migration 0042): the Superadmin and candidates are never limited; single Admins can be marked "Any network". The refusal is shown only after the right password, so it doesn't reveal Admin emails.
- **Session lengths**: candidates 24h idle / 5 days max, staff 8h idle / 1 day max.
- **Every repeatable action that stores rows has a cap** (logins, logouts, mock starts: 10 per hour, wrong current passwords, voice characters).

## Learning

- **Tracking is per test type**, and Handbook, Practice and Mock are tracked separately (1 Oct).
- A content page counts as done once its last part has been on screen; a question page once Check answer or Reveal answer is used.
- **A question never splits across pages** in the book; it shrinks a little, then scrolls within its page as a last resort.
- **Mock test**: 50 questions spread across the test type's chapters in proportion to size, 45 minutes (scaled if fewer questions). The timer runs on the server and keeps running if the candidate leaves; one test open at a time; unlimited tests (10 starts per hour).
- **Wording**: never "pass/fail" or a guaranteed pass; results speak of the 90% readiness target. No CITB questions are reproduced or invented; real content comes from the owner only.
- Starting and submitting mocks, answers and reading progress are **not** activity-log actions.

## Content

- **Bulk upload** (27–30 Oct): batches keep a source key (e.g. `AD-p012`) so a re-upload updates instead of duplicating; new items arrive as drafts.
- **Backup & Restore** covers shared content only (structure, pages, questions, pictures, languages). Not in backups: General queries, the support contact, audio, accounts, candidates' data, logs. Restore works only into an empty project.
- **Fresh production database** (23 Oct): `schema.sql` plus a seed with only the required rows (support contact row, English and its spoken phrases, the Superadmin). Anything the app can create is not seeded.

## Listen

- **Google Cloud** for translation and audio (WaveNet voices); **Welsh audio on Gemini** (Google has no Welsh voice), set per language in the catalogue (26 Oct).
- Machine translations are marked "checked automatically" until a person checks them.
- Batch Generate: one chapter in one language per run, run from the browser.

## Look

- Candidate side: the "15-to-80" bar, mobile-first, Duolingo as inspiration for the look refresh (Oct).
- Title Case for every page name and heading, staff and candidate (4 Nov).
- Staff loading: a loading screen for pages inside a section; tab switches keep the page and show a bar on the clicked tab (4 Nov).
