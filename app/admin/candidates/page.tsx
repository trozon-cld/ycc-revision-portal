import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { customDateBounds, formatUkDate } from "@/lib/candidates/access";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/params";
import { escapeLike } from "@/lib/db/like";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/admin/filter-bar";
import { Breakable } from "@/components/admin/breakable";
import { PersonLabel } from "@/components/admin/person-label";
import { PageHeader } from "@/components/admin/page-header";
import { Pagination, pageFromParam } from "@/components/admin/pagination";
import { Cell, Row, Table } from "@/components/admin/table";
import { NewCandidateButton } from "./create-candidate-form";
import { AdminCandidateActions, SuperadminCandidateActions } from "./candidate-row-actions";
import { CategoryOptions, type CategoryChoice } from "./category-options";
import { CandidateStatusBadge } from "./status-badge";
import { candidateProgressPath } from "@/lib/candidates/paths";

interface CandidateRow {
  id: string;
  email: string;
  full_name: string | null;
  category_id: string;
  category_name: string;
  current_category_name: string;
  admin_id: string;
  admin_email: string;
  admin_name: string | null;
  access_expires_at: string | null;
  is_blocked: boolean;
}

interface Option {
  id: string;
  label: string;
}

const PAGE_SIZE = 50;
const STATUSES = ["active", "expired", "blocked"] as const;
type Status = (typeof STATUSES)[number];

export default async function CandidatesPage({ searchParams }: PageProps<"/admin/candidates">) {
  const session = await requireRole(["admin", "superadmin"]);
  const isSuperadmin = session.role === "superadmin";
  const params = await searchParams;
  const { min: minDate, max: maxDate } = customDateBounds();

  const search = (firstParam(params.q) ?? "").trim().slice(0, 100);
  const categoryFilter = uuidOrNull(firstParam(params.category));
  const statusParam = firstParam(params.status) ?? "";
  const status = (STATUSES as readonly string[]).includes(statusParam) ? (statusParam as Status) : null;
  // Admins are always pinned to their own candidates, whatever the URL says.
  const ownerFilter = isSuperadmin ? uuidOrNull(firstParam(params.admin)) : session.sub;
  const isFiltered = Boolean(search || categoryFilter || status || (isSuperadmin && ownerFilter));

  // Shared by the count and the page, so both always use the same filters.
  const where = `u.role = 'candidate'
         and ($1::uuid is null or u.admin_id = $1::uuid)
         and ($2::text is null or u.email ilike '%' || $2::text || '%' or u.full_name ilike '%' || $2::text || '%')
         and ($3::uuid is null or u.category_id = $3::uuid or u.current_category_id = $3::uuid)
         and ($4::text is null
              or ($4::text = 'blocked' and u.is_blocked)
              or ($4::text = 'expired' and not u.is_blocked and u.access_expires_at <= now())
              or ($4::text = 'active' and not u.is_blocked
                  and (u.access_expires_at is null or u.access_expires_at > now())))`;
  const filterValues = [ownerFilter, search ? escapeLike(search) : null, categoryFilter, status];
  const { rows: counted } = await pool.query<{ total: number }>(
    `select count(*)::int as total from users u where ${where}`,
    filterValues
  );
  const total = counted[0].total;
  const page = pageFromParam(firstParam(params.page), total, PAGE_SIZE);

  const [{ rows: candidates }, { rows: categories }, { rows: admins }] = await Promise.all([
    pool.query<CandidateRow>(
      `select u.id, u.email, u.full_name, u.category_id, c.name as category_name, cc.name as current_category_name,
              u.admin_id, a.email as admin_email, a.full_name as admin_name, u.access_expires_at, u.is_blocked
       from users u
       join categories c on c.id = u.category_id
       join categories cc on cc.id = u.current_category_id
       join users a on a.id = u.admin_id
       where ${where}
       order by u.created_at desc, u.id
       limit $5 offset $6`,
      [...filterValues, PAGE_SIZE, (page - 1) * PAGE_SIZE]
    ),
    pool.query<CategoryChoice>(
      `select c.id, c.name, g.name as "group"
       from categories c join category_groups g on g.id = c.group_id
       order by g.position, c.name`
    ),
    isSuperadmin
      ? pool.query<Option>(
          `select id, coalesce(full_name || ' (' || email || ')', email) as label
           from users where role = 'admin' order by lower(coalesce(full_name, email))`
        )
      : Promise.resolve({ rows: [] as Option[] }),
  ]);

  const now = Date.now();
  const columns = isSuperadmin
    ? ["Candidate", "Category", "Admin", "Status", "Access until", ""]
    : ["Candidate", "Category", "Status", "Access until", ""];
  const countLabel = `${total.toLocaleString("en-GB")} candidate${total === 1 ? "" : "s"}`;
  const query: Record<string, string> = {
    q: search,
    category: categoryFilter ?? "",
    status: status ?? "",
    admin: isSuperadmin ? (ownerFilter ?? "") : "",
  };

  return (
    <>
      <PageHeader
        title="Candidates"
        description={isFiltered ? `${countLabel} match your filters` : countLabel}
        actions={
          !isSuperadmin && (
            <NewCandidateButton
              categories={categories}
              minDate={minDate}
              maxDate={maxDate}
            />
          )
        }
      />

      <FilterBar action="/admin/candidates" clearHref="/admin/candidates" isFiltered={isFiltered}>
        <FilterSearch name="q" label="Search by name or email" defaultValue={search} />
        <FilterSelect name="category" label="Category" defaultValue={categoryFilter ?? ""}>
          <option value="">All categories</option>
          <CategoryOptions categories={categories} />
        </FilterSelect>
        <FilterSelect name="status" label="Status" defaultValue={status ?? ""}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="blocked">Blocked</option>
        </FilterSelect>
        {isSuperadmin && (
          <FilterSelect name="admin" label="Admin" defaultValue={ownerFilter ?? ""}>
            <option value="">All admins</option>
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.label}
              </option>
            ))}
          </FilterSelect>
        )}
      </FilterBar>

      <Table
        columns={columns}
        isEmpty={candidates.length === 0}
        emptyMessage={isFiltered ? "No candidates match these filters." : "No candidates yet."}
      >
        {candidates.map((candidate) => {
          const expiresAt = candidate.access_expires_at;
          const isExpired = expiresAt !== null && new Date(expiresAt).getTime() <= now;
          const expiryDate = expiresAt ? formatUkDate(expiresAt) : "No expiry";
          const rowCandidate = {
            id: candidate.id,
            email: candidate.email,
            name: candidate.full_name,
            categoryId: candidate.category_id,
            adminId: candidate.admin_id,
            isBlocked: candidate.is_blocked,
            expiryLabel: expiresAt ? `${isExpired ? "Expired on" : "Expires"} ${expiryDate}` : "No expiry set",
          };

          return (
            <Row key={candidate.id}>
              <Cell kind="primary">
                <PersonLabel name={candidate.full_name} email={candidate.email} href={candidateProgressPath(candidate.id)} />
              </Cell>
              <Cell label="Category">
                {candidate.current_category_name}
                {candidate.current_category_name !== candidate.category_name && (
                  <span className="block text-xs text-slate-600">Assigned: {candidate.category_name}</span>
                )}
              </Cell>
              {isSuperadmin && (
                <Cell label="Admin" breakAnywhere>
                  <Breakable text={candidate.admin_name ?? candidate.admin_email} />
                </Cell>
              )}
              <Cell label="Status">
                <CandidateStatusBadge isBlocked={candidate.is_blocked} isExpired={isExpired} />
              </Cell>
              <Cell label="Access until" nowrap>
                {expiryDate}
              </Cell>
              <Cell kind="actions">
                {isSuperadmin ? (
                  <SuperadminCandidateActions
                    candidate={rowCandidate}
                    admins={admins}
                  />
                ) : (
                  <AdminCandidateActions
                    candidate={rowCandidate}
                    categories={categories}
                    minDate={minDate}
                    maxDate={maxDate}
                  />
                )}
              </Cell>
            </Row>
          );
        })}
      </Table>

      <Pagination
        basePath="/admin/candidates"
        page={page}
        hasMore={page * PAGE_SIZE < total}
        query={query}
        total={total}
        pageSize={PAGE_SIZE}
      />
    </>
  );
}


function uuidOrNull(value: string | undefined): string | null {
  return isUuid(value) ? value : null;
}
