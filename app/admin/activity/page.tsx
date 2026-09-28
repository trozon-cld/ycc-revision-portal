import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { ACCESS_TIME_ZONE } from "@/lib/candidates/access";
import {
  ACTION_AREAS,
  ACTIVITY_ACTIONS,
  ADMIN_ACTIONS,
  AUTH_EVENTS,
  isActivityAction,
  isAuthEvent,
  type ActivityAction,
  type AuthEvent,
} from "@/lib/audit/actions";
import { Badge } from "@/components/admin/badge";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/admin/filter-bar";
import { Breakable } from "@/components/admin/breakable";
import { PageHeader } from "@/components/admin/page-header";
import { buttonClass } from "@/components/admin/styles";
import { Cell, Row, Table } from "@/components/admin/table";

const PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_LABELS = { superadmin: "Superadmin", admin: "Admin", candidate: "Candidate" } as const;
type RoleKey = keyof typeof ROLE_LABELS;

interface ActivityRow {
  id: string;
  created_at: string;
  actor_email: string;
  actor_role: RoleKey;
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
  role: RoleKey | null;
  ip_address: string | null;
}

interface ActorRow {
  actor_id: string;
  actor_email: string;
  actor_role: RoleKey;
}

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  const session = await requireRole(["admin", "superadmin"]);
  const isSuperadmin = session.role === "superadmin";
  const params = await searchParams;

  const tab = one(params.tab) === "logins" ? "logins" : "activity";
  const page = Math.max(1, Number.parseInt(one(params.page) ?? "1", 10) || 1);
  const actionParam = one(params.action) ?? "";
  const eventParam = one(params.event) ?? "";
  const actorParam = one(params.actor) ?? "";
  const emailSearch = isSuperadmin ? (one(params.q) ?? "").trim().slice(0, 100) : "";

  const allowedActions = isSuperadmin
    ? (Object.keys(ACTIVITY_ACTIONS) as ActivityAction[])
    : ADMIN_ACTIONS;
  const action = isActivityAction(actionParam) && allowedActions.includes(actionParam) ? actionParam : null;
  const event = isAuthEvent(eventParam) ? eventParam : null;
  // Admins are always pinned to their own entries, whatever the URL says.
  const actorId = isSuperadmin ? (UUID_PATTERN.test(actorParam) ? actorParam : null) : session.sub;
  const offset = (page - 1) * PAGE_SIZE;

  const filters: Record<string, string> =
    tab === "activity"
      ? { tab, action: action ?? "", actor: isSuperadmin ? actorId ?? "" : "" }
      : { tab, event: event ?? "", q: emailSearch };

  return (
    <>
      <PageHeader
        title={isSuperadmin ? "Activity" : "My activity"}
        description={
          isSuperadmin
            ? "Everything admins and the Superadmin have changed, candidates’ category switches, and every login."
            : "Changes you have made, category switches by your candidates, and your logins."
        }
      />

      <nav aria-label="Log type" className="mb-4 inline-flex rounded-md border border-slate-300 bg-white p-0.5">
        <TabLink href="/admin/activity" isCurrent={tab === "activity"} label="Actions" />
        <TabLink href="/admin/activity?tab=logins" isCurrent={tab === "logins"} label="Logins" />
      </nav>

      {tab === "activity" ? (
        <ActivityTab
          isSuperadmin={isSuperadmin}
          ownerId={isSuperadmin ? null : session.sub}
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
          emailSearch={emailSearch}
          offset={offset}
          page={page}
          filters={filters}
        />
      )}
    </>
  );
}

async function ActivityTab({
  isSuperadmin,
  ownerId,
  actorId,
  action,
  allowedActions,
  offset,
  page,
  filters,
}: {
  isSuperadmin: boolean;
  // Admins: also shows category switches made by their own candidates.
  ownerId: string | null;
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
       where ($1::uuid is null or actor_id = $1::uuid
              or ($5::uuid is not null and action = 'candidate.category_switched'
                  and target_id in (select id from users where admin_id = $5::uuid)))
         and ($2::varchar is null or action = $2::varchar)
       order by created_at desc
       limit $3 offset $4`,
      [actorId, action, PAGE_SIZE + 1, offset, ownerId]
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
  const isFiltered = Boolean(filters.action || filters.actor);
  const columns = isSuperadmin
    ? ["When", "Action", "Applies to", "Details", "Done by", "IP"]
    : ["When", "Action", "Applies to", "Details", "IP"];

  return (
    <>
      <FilterBar
        action="/admin/activity"
        clearHref="/admin/activity"
        isFiltered={isFiltered}
        hidden={{ tab: "activity" }}
      >
        {isSuperadmin && (
          <FilterSelect name="actor" label="Done by" defaultValue={filters.actor}>
            <option value="">Everyone</option>
            {actors.map((actor) => (
              <option key={actor.actor_id} value={actor.actor_id}>
                {actor.actor_email} ({ROLE_LABELS[actor.actor_role]})
              </option>
            ))}
          </FilterSelect>
        )}
        <FilterSelect name="action" label="Type of action" defaultValue={filters.action}>
          <option value="">All actions</option>
          {ACTION_AREAS.map((area) => {
            const inArea = allowedActions.filter((value) => area.prefixes.includes(value.split(".")[0]));
            if (inArea.length === 0) return null;
            return (
              <optgroup key={area.label} label={area.label}>
                {inArea.map((value) => (
                  <option key={value} value={value}>
                    {ACTIVITY_ACTIONS[value]}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </FilterSelect>
      </FilterBar>

      <Table
        columns={columns}
        isEmpty={entries.length === 0}
        emptyMessage={isFiltered ? "Nothing matches these filters." : "Nothing recorded yet."}
      >
        {entries.map((entry) => (
          <Row key={entry.id}>
            <Cell kind="primary">
              <span className="md:whitespace-nowrap md:font-normal md:text-slate-600">
                {formatUkDateTime(entry.created_at)}
              </span>
            </Cell>
            <Cell label="Action">{ACTIVITY_ACTIONS[entry.action] ?? entry.action}</Cell>
            <Cell label="Applies to" breakAnywhere>
              <Breakable text={entry.target_label} />
            </Cell>
            <Cell label="Details" breakAnywhere>
              <Breakable text={describeDetails(entry.details) ?? "—"} />
            </Cell>
            {isSuperadmin && (
              <Cell label="Done by" breakAnywhere>
                <Breakable text={entry.actor_email} />
                <span className="text-slate-600"> ({ROLE_LABELS[entry.actor_role]})</span>
              </Cell>
            )}
            <Cell label="IP" nowrap>{entry.ip_address ?? "—"}</Cell>
          </Row>
        ))}
      </Table>

      <Pagination page={page} hasMore={hasMore} filters={filters} />
    </>
  );
}

async function LoginsTab({
  isSuperadmin,
  userId,
  event,
  emailSearch,
  offset,
  page,
  filters,
}: {
  isSuperadmin: boolean;
  userId: string | null;
  event: AuthEvent | null;
  emailSearch: string;
  offset: number;
  page: number;
  filters: Record<string, string>;
}) {
  const { rows } = await pool.query<AuthRow>(
    `select id, created_at, event, email, role, ip_address
     from auth_events
     where ($1::uuid is null or user_id = $1::uuid)
       and ($2::varchar is null or event = $2::varchar)
       and ($3::text is null or email ilike '%' || $3::text || '%')
     order by created_at desc
     limit $4 offset $5`,
    [userId, event, emailSearch ? escapeLike(emailSearch) : null, PAGE_SIZE + 1, offset]
  );
  const hasMore = rows.length > PAGE_SIZE;
  const entries = rows.slice(0, PAGE_SIZE);
  const isFiltered = Boolean(filters.event || filters.q);
  const columns = isSuperadmin ? ["When", "Event", "Account", "IP"] : ["When", "Event", "IP"];

  return (
    <>
      <FilterBar
        action="/admin/activity"
        clearHref="/admin/activity?tab=logins"
        isFiltered={isFiltered}
        hidden={{ tab: "logins" }}
      >
        {isSuperadmin && <FilterSearch name="q" label="Search by email" defaultValue={filters.q} />}
        <FilterSelect name="event" label="Type" defaultValue={filters.event}>
          <option value="">All events</option>
          {(Object.keys(AUTH_EVENTS) as AuthEvent[]).map((value) => (
            <option key={value} value={value}>
              {AUTH_EVENTS[value]}
            </option>
          ))}
        </FilterSelect>
      </FilterBar>

      <Table
        columns={columns}
        isEmpty={entries.length === 0}
        emptyMessage={isFiltered ? "Nothing matches these filters." : "Nothing recorded yet."}
      >
        {entries.map((entry) => (
          <Row key={entry.id}>
            <Cell kind="primary">
              <span className="md:whitespace-nowrap md:font-normal md:text-slate-600">
                {formatUkDateTime(entry.created_at)}
              </span>
            </Cell>
            <Cell label="Event">
              <Badge tone={entry.event === "login_failed" ? "danger" : entry.event === "logout" ? "neutral" : "success"}>
                {AUTH_EVENTS[entry.event]}
              </Badge>
            </Cell>
            {isSuperadmin && (
              <Cell label="Account" breakAnywhere>
                <Breakable text={entry.email} />
                <span className="text-slate-600">
                  {entry.role ? ` (${ROLE_LABELS[entry.role]})` : " (no such account)"}
                </span>
              </Cell>
            )}
            <Cell label="IP" nowrap>{entry.ip_address ?? "—"}</Cell>
          </Row>
        ))}
      </Table>

      <Pagination page={page} hasMore={hasMore} filters={filters} />
    </>
  );
}

function TabLink({ href, isCurrent, label }: { href: string; isCurrent: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      className={`inline-flex h-9 items-center rounded px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:h-8 ${
        isCurrent ? "bg-primary text-white" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {label}
    </Link>
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

  return (
    <div className="mt-4 flex items-center justify-between gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={buttonClass("secondary", "sm")}>
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-slate-600">Page {page}</span>
      {hasMore ? (
        <Link href={hrefFor(page + 1)} className={buttonClass("secondary", "sm")}>
          Older →
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}

function describeDetails(details: Record<string, string>): string | null {
  const parts: string[] = [];
  if (details.from !== undefined && details.to !== undefined) parts.push(`${details.from} → ${details.to}`);
  if (details.previousCurrent) parts.push(`Was working in: ${details.previousCurrent}`);
  if (details.group) parts.push(`Group: ${details.group}`);
  if (details.section) parts.push(`Section: ${details.section}`);
  if (details.chapter) parts.push(`Chapter: ${details.chapter}`);
  if (details.position) parts.push(details.position);
  if (details.items) parts.push(details.items);
  if (details.questionType) parts.push(`Type: ${details.questionType}`);
  if (details.total !== undefined) {
    parts.push(`Chapters +${details.added ?? 0} −${details.removed ?? 0} (${details.total} in total)`);
  }
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

// Treat the user's % and _ literally; Postgres LIKE uses backslash as its escape.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
