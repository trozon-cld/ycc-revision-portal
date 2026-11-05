# Architecture

## Stack

- Next.js 16.4 (App Router, Turbopack, React 19, React Compiler lint rules), TypeScript, Tailwind CSS 4. Next 16 differs from older versions: read `AGENTS.md` and `node_modules/next/dist/docs/` before changing routing, data fetching or config.
- Node.js 24 (`.nvmrc`, `engines` in `package.json`).
- PostgreSQL through the `pg` library (plain SQL, one shared pool in `lib/db/pool.ts`). Hosted on Supabase today, but no Supabase Auth, client library, Row-Level Security or Realtime is used.
- File storage: Supabase Storage, private buckets only, reached only from `lib/storage/storage.ts`.
- Sign-in: our own JWT (jose) in an HTTP-only cookie, passwords hashed with bcryptjs.
- Voice: Google Cloud Translation and Text-to-Speech; Gemini for languages Google can't read aloud (Welsh).

## Roles

- **Superadmin**: Admin accounts, the office network, test areas and test types, all shared content (Handbook, question bank, media, General queries), Backup & Restore, every candidate and every log.
- **Admin**: their own candidates only (logins, expiry, assigned test type, progress). Can be limited to the office network.
- **Candidate**: studies one test type at a time (Prepare, Practice, Mock Test, My Progress, Help).

Content editing is Superadmin-only for launch. The one switch is `CONTENT_EDITORS` in `lib/auth/content-editors.ts`; adding `"admin"` opens the same pages, actions and sidebar links to Admins.

## Content model

- **Test areas** (General, Specialist) hold **test types** (Operative; 12 specialist types). A candidate has an *assigned* test type (set by their Admin) and a *current* one (their own choice, always in the same test area).
- Each test type's book is its linked **chapters**, grouped in **sections** A–E. A section is either linked to every test type (the 16 core chapters, A–D) or each of its chapters belongs to one test type (specialist chapters, E).
- Chapters hold **pages** (learning pages and Handbook questions) and the **question bank** holds every question, with switches for Handbook, Practice and Mock tests.
- Numbers are never stored in titles: section letters come from section order, staff lists show the fixed chapter number (01–28), and a candidate's book numbers chapters within that book (a specialist chapter is always 17).
- Handbook, Practice and Mock results are kept per test type and never mixed.
- **Structure lock**: while on, sections, chapters, chapter links and unpublishing are refused.

## Sign-in and guards

- `proxy.ts` sends signed-out visitors to the login page and each role to its own area, and renews sign-ins in use. It never touches the database.
- **Every page, layout, metadata function and server action starts with `requireRole`** (`lib/auth/guard.ts`). It checks the account live: deleted, blocked, expired, password changed, and the office network for Admins.
- Session lengths (`lib/auth/constants.ts`): candidates 24 hours idle / 5 days at most; staff 8 hours idle / 1 day at most.
- Login limits (`lib/auth/rate-limit.ts`): 5 failures per email and address, 30 per address, and a site-wide pause at 300 failures, each for 15 minutes. Successful-login and logout records are capped too.
- Admin actions on candidates are always limited to that Admin's own candidates.
- Who may use Backup & Restore's Backup and Restore tabs: `BACKUP_ROLES` (`lib/content/backup/access.ts`).
- **Office network**: when the Superadmin turns it on, Admins sign in only from the listed addresses (unless marked "Any network"). The visitor's address is read in one place, `ipFromHeaders` in `lib/audit/log.ts`; it must match how the host sets the forwarded header (see the go-live checklist).
- Large requests (picture uploads, bulk upload, backup and restore) are Route Handlers under `app/api/` that check the live sign-in, role, origin and size *before* reading the body. Server actions keep Next's 1 MB default.

## Marking and what reaches the browser

- Practice and Mock answers are marked on the server; correct answers reach the browser only after the candidate checks (Practice) or the test ends (Mock).
- By design, Handbook questions (learn mode) are sent with their answers so the reader can show them instantly.

## Activity log

- Every action that creates, changes or deletes users, access or content writes one entry in the same transaction, through `lib/audit`. Every action is listed in `lib/audit/actions.ts`.
- Passwords and secrets are never logged. Candidates' high-volume data (answers, attempts, reading progress) never goes in the activity log.
- The activity log is never trimmed. Login records older than 180 days can be archived by the Superadmin, a whole UK month at a time, saved to the `log-archives` bucket before the rows are deleted.

## Storage

- `lib/storage/storage.ts` is the only code that talks to the storage provider: upload, delete, short-lived signed links. Buckets: `handbook-media` (pictures), `log-archives` (archived login records), `handbook-audio` (Listen MP3s).
- Pictures are checked by their real content and converted to WebP in the browser. Each is capped at 5 MB, or less if the host's request limit needs it (about 3.2 MB on Vercel); the total is capped at 900 MB by default. Both host-dependent sizes are host settings read in `lib/hosting.ts`.
- Moving to S3 or similar means rewriting that one file and copying the buckets.

## Voice (Listen)

- `lib/voice/services.ts` chooses the service: Google (`google.ts`) by default, Gemini (`gemini.ts`) for languages the catalogue gives to it, and a stand-in (`fake.ts`) for local tests (refused in production).
- Languages live in the database; the list that can be added is `lib/voice/language-catalogue.ts` (one line each).
- Each staff member has an hourly allowance in characters, with monthly totals per service (`lib/voice/quota.ts`, `lib/voice/limits.ts`).
- Batch Generate runs one chapter in one language from the browser, step by step, and logs one entry per run.
- Candidates' audio is fetched through `/api/handbook/audio/[itemId]`, which checks their live sign-in and test type, then redirects to a short-lived private link.

## UI

- **Candidate pages and the login page**: the "15-to-80" bar: large targets (at least 44px, buttons 48px), reading text at least 16px, high contrast, mobile-first, no unnecessary popups. Built from `components/candidate/` (`buttons.ts` for buttons, cards, choice rows, badges, bars). Below 1024px a bottom tab bar (Home, Prepare, Practice, Mock Test, Progress).
- **Focused modes** (Handbook, Practice, Mock Test) share one bar, Settings panel, button-label choice and "Opening…" screen, and never show the tab bar.
- **Staff pages**: compact and data-dense, built only from `components/admin/` (sidebar shell, tables, row menus, slide-in panels, `PageTabs`, `Breadcrumbs`, `Pagination`). Loading: `loading.tsx` for pages opened inside a section; tab switches use `LinkPending` instead (a loading screen would hide the tabs).
- Page names and headings are in Title Case; candidate text is UK English.
- Colours are named once in `app/globals.css` (brand: Deep Cobalt #005DA1, Lagoon Blue #00AAC5, Navy Ink #1E293B, white). Icons only through `components/icons.tsx` (Phosphor).
