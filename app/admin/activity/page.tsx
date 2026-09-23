import Link from "next/link";
import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { ACCESS_TIME_ZONE } from "@/lib/candidates/access";
import {
  ACTIVITY_ACTIONS,
  ADMIN_ACTIONS,
  AUTH_EVENTS,
  isActivityAction,
  isAuthEvent,
  type ActivityAction,
  type AuthEvent,
} from "@/lib/audit/actions";
import { LogoutButton } from "@/components/logout-button";
import { AreaNav } from "@/components/area-nav";

const PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_LABELS = { superadmin: "Superadmin", admin: "Admin", candidate: "Candidate" } as const;

const selectClass =
  "w-full rounded-lg border border-ink/25 bg-surface px-4 py-3 text-base text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40";

interface ActivityRow {
  id: string;
  created_at: string;
  actor_email: string;
  actor_role: keyof typeof ROLE_LABELS;
  action: ActivityAction;
  target_label: string;
  details: Record<string, string>;
  ip_address: string | null;
}

interface AuthRow {
  id: string;
  created_at: string;
  event: AuthEvent;
  email: string;
  role: keyof typeof ROLE_LABELS | null;
  ip_address: string | null;
}

interface ActorRow {
  actor_id: string;
  actor_email: string;
  actor_role: keyof typeof ROLE_LABELS;
}

type Params = Record<string, string | string[] | undefined>;

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  const session = await requireRole(["admin", "superadmin"]);
  const isSuperadmin = session.role === "superadmin";
  const params: Params = await searchParams;

  const tab = one(params.tab) === "logins" ? "logins" : "activity";
  const page = Math.max(1, Number.parseInt(one(params.page) ?? "1", 10) || 1);
  const actionParam = one(params.action) ?? "";
  const eventParam = one(params.event) ?? "";
  const actorParam = one(params.actor) ?? "";

  const allowedActions = isSuperadmin
    ? (Object.keys(ACTIVITY_ACTIONS) as ActivityAction[])
    : ADMIN_ACTIONS;
  const action = isActivityAction(actionParam) && allowedActions.includes(actionParam) ? actionParam : null;
  const event = isAuthEvent(eventParam) ? eventParam : null;
  // Admins are always pinned to their own entries, whatever the URL says.
  const actorId = isSuperadmin ? (UUID_PATTERN.test(actorParam) ? actorParam : null) : session.sub;

  const filters = { tab, action: action ?? "", event: event ?? "", actor: isSuperadmin ? actorId ?? "" : "" };
  const offset = (page - 1) * PAGE_SIZE;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base uppercase tracking-wide text-primary">
            {isSuperadmin ? "Superadmin" : "Admin"}
          </p>
          <h1 className="text-2xl font-semibold text-ink">
            {isSuperadmin ? "Activity" : "My activity"}
          </h1>
          <p className="mt-1 break-all text-base text-ink/70">Signed in as {session.email}</p>
        </div>
        <LogoutButton />
      </div>

      <AreaNav role={isSuperadmin ? "superadmin" : "admin"} current="/admin/activity" />

      <nav aria-label="Log type" className="flex flex-wrap gap-2 border-b border-ink/15 pb-4">
        <TabLink href="/admin/activity" isCurrent={tab === "activity"} label="Actions" />
        <TabLink href="/admin/activity?tab=logins" isCurrent={tab === "logins"} label="Logins" />
      </nav>

      {tab === "activity" ? (
        <ActivityTab
          isSuperadmin={isSuperadmin}
          actorId={actorId}
          action={action}
          allowedActions={allowedActions}
          offset={offset}
          page={page}
          filters={filters}
        />
      ) : (
        <LoginsTab
          isSuperadmin={isSuperadmin}
          userId={isSuperadmin ? null : session.sub}
          event={event}
          offset={offset}
          page={page}
          filters={filters}
        />
      )}
    </div>
  );
}

async function ActivityTab({
  isSuperadmin,
  actorId,
  action,
  allowedActions,
  offset,
  page,
  filters,
}: {
  isSuperadmin: boolean;
  actorId: string | null;
  action: ActivityAction | null;
  allowedActions: ActivityAction[];
  offset: number;
  page: number;
  filters: Record<string, string>;
}) {
  const [{ rows }, { rows: actors }] = await Promise.all([
    pool.query<ActivityRow>(
      `select id, created_at, actor_email, actor_role, action, target_label, details, ip_address
       from activity_logs
       where ($1::uuid is null or actor_id = $1::uuid)
         and ($2::varchar is null or action = $2::varchar)
       order by created_at desc
       limit $3 offset $4`,
      [actorId, action, PAGE_SIZE + 1, offset]
    ),
    isSuperadmin
      ? pool.query<ActorRow>(
          `select * from (
             select distinct on (actor_id) actor_id, actor_email, actor_role
             from activity_logs order by actor_id, created_at desc
           ) latest order by actor_email`
        )
      : Promise.resolve({ rows: [] as ActorRow[] }),
  ]);
  const hasMore = rows.length > PAGE_SIZE;
  const entries = rows.slice(0, PAGE_SIZE);

  return (
    <>
      <form method="get" className="grid gap-4 rounded-xl border border-ink/15 p-4 sm:grid-cols-2">
        <input type="hidden" name="tab" value="activity" />
        {isSuperadmin && (
          <FilterSelect id="actor" label="Done by" defaultValue={filters.actor}>
            <option value="">Everyone</option>
            {actors.map((actor) => (
              <option key={actor.actor_id} value={actor.actor_id}>
                {actor.actor_email} ({ROLE_LABELS[actor.actor_role]})
              </option>
            ))}
          </FilterSelect>
        )}
        <FilterSelect id="action" label="Type of action" defaultValue={filters.action}>
          <option value="">All actions</option>
          {allowedActions.map((value) => (
            <option key={value} value={value}>
              {ACTIVITY_ACTIONS[value]}
            </option>
          ))}
        </FilterSelect>
        <FilterButtons clearHref="/admin/activity" />
      </form>

      <EntryList isEmpty={entries.length === 0}>
        {entries.map((entry) => {
          const detail = describeDetails(entry.details);
          return (
            <li key={entry.id} className="space-y-1 p-4 text-base text-ink">
              <p>
                <span className="font-medium">{ACTIVITY_ACTIONS[entry.action] ?? entry.action}</span>
                {" · "}
                <span className="break-all">{entry.target_label}</span>
              </p>
              {detail && <p className="break-all">{detail}</p>}
              <p className="text-ink/70">
                {formatUkDateTime(entry.created_at)}
                {isSuperadmin && (
                  <>
                    {" · by "}
                    <span className="break-all">{entry.actor_email}</span> ({ROLE_LABELS[entry.actor_role]})
                  </>
                )}
                {entry.ip_address && ` · IP ${entry.ip_address}`}
              </p>
            </li>
          );
        })}
      </EntryList>

      <Pagination page={page} hasMore={hasMore} filters={filters} />
    </>
  );
}

async function LoginsTab({
  isSuperadmin,
  userId,
  event,
  offset,
  page,
  filters,
}: {
  isSuperadmin: boolean;
  userId: string | null;
  event: AuthEvent | null;
  offset: number;
  page: number;
  filters: Record<string, string>;
}) {
  const { rows } = await pool.query<AuthRow>(
    `select id, created_at, event, email, role, ip_address
     from auth_events
     where ($1::uuid is null or user_id = $1::uuid)
       and ($2::varchar is null or event = $2::varchar)
     order by created_at desc
     limit $3 offset $4`,
    [userId, event, PAGE_SIZE + 1, offset]
  );
  const hasMore = rows.length > PAGE_SIZE;
  const entries = rows.slice(0, PAGE_SIZE);

  return (
    <>
      <form method="get" className="grid gap-4 rounded-xl border border-ink/15 p-4 sm:grid-cols-2">
        <input type="hidden" name="tab" value="logins" />
        <FilterSelect id="event" label="Type" defaultValue={filters.event}>
          <option value="">All</option>
          {(Object.keys(AUTH_EVENTS) as AuthEvent[]).map((value) => (
            <option key={value} value={value}>
              {AUTH_EVENTS[value]}
            </option>
          ))}
        </FilterSelect>
        <FilterButtons clearHref="/admin/activity?tab=logins" />
      </form>

      <EntryList isEmpty={entries.length === 0}>
        {entries.map((entry) => (
          <li key={entry.id} className="space-y-1 p-4 text-base text-ink">
            <p>
              <span className={entry.event === "login_failed" ? "font-medium text-red-700" : "font-medium"}>
                {AUTH_EVENTS[entry.event]}
              </span>
              {isSuperadmin && (
                <>
                  {" · "}
                  <span className="break-all">{entry.email}</span>
                  {entry.role ? ` (${ROLE_LABELS[entry.role]})` : " (no such account)"}
                </>
              )}
            </p>
            <p className="text-ink/70">
              {formatUkDateTime(entry.created_at)}
              {entry.ip_address && ` · IP ${entry.ip_address}`}
            </p>
          </li>
        ))}
      </EntryList>

      <Pagination page={page} hasMore={hasMore} filters={filters} />
    </>
  );
}

function TabLink({ href, isCurrent, label }: { href: string; isCurrent: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      className={
        isCurrent
          ? "rounded-lg bg-ink px-5 py-3 text-base font-medium text-surface"
          : "rounded-lg border border-ink/25 px-5 py-3 text-base font-medium text-ink hover:bg-ink/5"
      }
    >
      {label}
    </Link>
  );
}

function FilterSelect({
  id,
  label,
  defaultValue,
  children,
}: {
  id: string;
  label: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-base font-medium text-ink">
        {label}
      </label>
      <select id={id} name={id} defaultValue={defaultValue} className={selectClass}>
        {children}
      </select>
    </div>
  );
}

function FilterButtons({ clearHref }: { clearHref: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
      <button
        type="submit"
        className="rounded-lg bg-primary px-5 py-3 text-base font-medium text-surface hover:bg-primary/90"
      >
        Apply filters
      </button>
      <Link
        href={clearHref}
        className="rounded-lg border border-ink/25 px-5 py-3 text-base font-medium text-ink hover:bg-ink/5"
      >
        Clear
      </Link>
    </div>
  );
}

function EntryList({ isEmpty, children }: { isEmpty: boolean; children: ReactNode }) {
  return (
    <ul className="divide-y divide-ink/15 rounded-lg border border-ink/15">
      {children}
      {isEmpty && <li className="p-4 text-base text-ink/70">Nothing recorded yet.</li>}
    </ul>
  );
}

function Pagination({
  page,
  hasMore,
  filters,
}: {
  page: number;
  hasMore: boolean;
  filters: Record<string, string>;
}) {
  if (page === 1 && !hasMore) return null;

  const hrefFor = (target: number) => {
    const query = new URLSearchParams(
      Object.entries({ ...filters, page: String(target) }).filter(([, value]) => value !== "")
    );
    return `/admin/activity?${query.toString()}`;
  };
  const buttonClass =
    "rounded-lg border border-ink/25 px-5 py-3 text-base font-medium text-ink hover:bg-ink/5";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {page > 1 ? <Link href={hrefFor(page - 1)} className={buttonClass}>Newer</Link> : <span />}
      <span className="text-base text-ink/70">Page {page}</span>
      {hasMore ? <Link href={hrefFor(page + 1)} className={buttonClass}>Older</Link> : <span />}
    </div>
  );
}

function describeDetails(details: Record<string, string>): string | null {
  if (details.from !== undefined && details.to !== undefined) {
    return `${details.from} → ${details.to}`;
  }
  const parts: string[] = [];
  if (details.category) parts.push(`Category: ${details.category}`);
  if (details.accessUntil) parts.push(`Access until ${details.accessUntil}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function formatUkDateTime(value: string): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ACCESS_TIME_ZONE,
  });
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
