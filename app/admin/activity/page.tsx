import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { ACCESS_TIME_ZONE, formatUkDate } from "@/lib/candidates/access";
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
import { ActionForm } from "@/components/admin/action-form";
import { ARCHIVE_AFTER_DAYS, archiveMonthText, listArchives, loadArchiveStatus } from "@/lib/audit/archive";
import { formatBytes } from "@/lib/format";
import { archiveOldLoginRecords } from "./actions";

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

  const tabParam = one(params.tab);
  const tab = tabParam === "logins" ? "logins" : tabParam === "archives" && isSuperadmin ? "archives" : "activity";
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
        {isSuperadmin && <TabLink href="/admin/activity?tab=archives" isCurrent={tab === "archives"} label="Archives" />}
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
      ) : tab === "archives" ? (
        <ArchivesTab page={page} />
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
          // Staff accounts, read from users: scanning the whole log for its actors would slow down as it grows.
          `select id as actor_id, email as actor_email, role as actor_role
           from users where role in ('superadmin', 'admin')
           order by lower(email)`
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
              <Badge tone={entry.event === "login_failed" ? "danger" : entry.event === "login_paused" ? "warning" : entry.event === "logout" ? "neutral" : "success"}>
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

const ARCHIVE_PAGE_SIZE = 12;

async function ArchivesTab({ page }: { page: number }) {
  const [status, archives] = await Promise.all([
    loadArchiveStatus(),
    listArchives((page - 1) * ARCHIVE_PAGE_SIZE, ARCHIVE_PAGE_SIZE + 1),
  ]);
  const hasMore = archives.length > ARCHIVE_PAGE_SIZE;
  const waitingRecords = status.waiting.reduce((sum, month) => sum + month.count, 0);

  return (
    <>
      <section aria-labelledby="archive-heading" className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 id="archive-heading" className="text-base font-semibold text-ink">
          Old login records
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Whole months older than {ARCHIVE_AFTER_DAYS} days (UK time) are saved to a file below, then removed from the
          Logins list. Each month is archived once. The Actions log is kept in full.
        </p>
        {status.waiting.length > 0 ? (
          <div className="mt-3">
            <p className="mb-3 text-sm text-ink">
              Ready to archive: {status.waiting.map((month) => archiveMonthText(month.month)).join(", ")} (
              {waitingRecords.toLocaleString("en-GB")} record{waitingRecords === 1 ? "" : "s"}).
            </p>
            <ActionForm
              action={archiveOldLoginRecords}
              layout="inline"
              submitLabel="Archive old login records"
              pendingLabel="Archiving…"
              successMessage="Old login records archived."
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink">
            Nothing to archive yet.
            {status.next &&
              ` The next month (${archiveMonthText(status.next.month)}) can be archived from ${formatUkDate(status.next.from)}.`}
          </p>
        )}
      </section>

      <Table
        columns={["Month", "Records", "File", "Archived", ""]}
        isEmpty={archives.length === 0}
        emptyMessage="No months archived yet."
      >
        {archives.slice(0, ARCHIVE_PAGE_SIZE).map((archive) => (
          <Row key={archive.id}>
            <Cell kind="primary">{archiveMonthText(archive.month)}</Cell>
            <Cell label="Records">{archive.recordCount.toLocaleString("en-GB")}</Cell>
            <Cell label="File">{formatBytes(archive.byteSize)}</Cell>
            <Cell label="Archived" breakAnywhere>
              {formatUkDateTime(archive.createdAt)} by <Breakable text={archive.archivedByEmail} />
            </Cell>
            <Cell label="Download">
              {archive.downloadUrl ? (
                <a href={archive.downloadUrl} className={buttonClass("secondary", "sm")}>
                  Download
                </a>
              ) : (
                <span className="text-slate-600">Unavailable</span>
              )}
            </Cell>
          </Row>
        ))}
      </Table>

      <Pagination page={page} hasMore={hasMore} filters={{ tab: "archives" }} />
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
  if (details.name) parts.push(`Name: ${details.name}`);
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
  if (details.categories) parts.push(`Categories: ${details.categories}`);
  if (details.addedCategories) parts.push(`Added: ${details.addedCategories}`);
  if (details.removedCategories) parts.push(`Removed: ${details.removedCategories}`);
  if (details.categoryTotal !== undefined) parts.push(`In ${details.categoryTotal} categor${details.categoryTotal === "1" ? "y" : "ies"}`);
  if (details.frontCover) parts.push(`Front cover: ${details.frontCover}`);
  if (details.backCover) parts.push(`Back cover: ${details.backCover}`);
  if (details.accessUntil) parts.push(`Access until ${details.accessUntil}`);
  if (details.records) parts.push(`${details.records} record${details.records === "1" ? "" : "s"}`);
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
