# Code conventions

## General

- Typed TypeScript; comments only for important context, one line preferred, two at most.
- Before writing a helper, constant or type, look in `lib/` first (`ids.ts`, `text.ts`, `format.ts`, `limits.ts`, `params.ts`, `forms.ts`, `bytes.ts`, `db/like.ts`, `db/names.ts`, `users/credentials.ts`) and reuse it.
- Share code only where it is the same idea. Related areas with the same shape get their own named alias of one type (e.g. `CandidateActionState = FormState`).
- Forms and server checks use the same constants (`lib/limits.ts`, `lib/users/credentials.ts`), never typed-in numbers.
- No new dependency without a clear reason.

## Next.js and React

- Next 16: check `node_modules/next/dist/docs/` before routing, data-fetching or config work.
- A `"use server"` file exports only server actions: every export is publicly callable. Helpers stay unexported or go in `lib/`.
- Every page, layout, metadata function and server action starts with `requireRole`. Content pages and actions use `CONTENT_EDITORS`, never a hand-written role list.
- Big requests go through Route Handlers that check sign-in, origin and size before reading.
- React Compiler lint rules (`npm run lint` must be clean):
  - no ref reads or writes during render: use `useLatest` (`components/use-latest.ts`);
  - no `setState` directly in an effect: use `useBrowserValue` / `useDeviceSwitch` (`components/use-browser-value.ts`), or adjust state during render;
  - no `Date.now()`, `Math.random()` or other impure calls in render: put them in a `lib` helper;
  - destructure refs returned from hooks; a callback never calls itself by name;
  - keep `useMemo`/`useCallback` simple, with plain values as dependencies;
  - an `eslint-disable` only where genuinely needed, with a one-line reason.

## Database

- Every schema change: a numbered file in `supabase/migrations/` and the same change in `supabase/schema.sql`. See "Database migrations" in the main README for the migration record rule.
- Lists that grow with use are paginated on the server.
- Keep candidate data compact (counters and short codes).

## Activity log

- Every create, change or delete of users, access or content writes an entry through `lib/audit`, in the same transaction, with the action listed in `lib/audit/actions.ts`.
- New actions are agreed with the owner first. Never log passwords or secrets; candidates' high-volume data stays out.

## UI

- Colours only from the named set in `app/globals.css` (no typed-in colours on candidate pages; Cobalt varied only by opacity; Lagoon for decoration only; one orange family for attention).
- Icons only through `components/icons.tsx`: bold on candidate pages, regular on staff pages, fill for selected/on.
- Candidate pages use `components/candidate/` building blocks; staff pages use `components/admin/`.
- Title Case for page names and headings; candidate text in UK English.
