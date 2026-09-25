import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { customDateBounds, formatUkDate } from "@/lib/candidates/access";
import { Badge } from "@/components/admin/badge";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/admin/filter-bar";
import { Breakable } from "@/components/admin/breakable";
import { PageHeader } from "@/components/admin/page-header";
import { Cell, Row, Table } from "@/components/admin/table";
import { NewCandidateButton } from "./create-candidate-form";
import { AdminCandidateActions, SuperadminCandidateActions } from "./candidate-row-actions";
import { CategoryOptions, type CategoryChoice } from "./category-options";

interface CandidateRow {
  id: string;
  email: string;
  category_id: string;
  category_name: string;
  current_category_name: string;
  admin_id: string;
  admin_email: string;
  access_expires_at: string | null;
  is_blocked: boolean;
}

interface Option {
  id: string;
  label: string;
}

const STATUSES = ["active", "expired", "blocked"] as const;
type Status = (typeof STATUSES)[number];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CandidatesPage({ searchParams }: PageProps<"/admin/candidates">) {
  const session = await requireRole(["admin", "superadmin"]);
  const isSuperadmin = session.role === "superadmin";
  const params = await searchParams;
  const { min: minDate, max: maxDate } = customDateBounds();

  const search = (one(params.q) ?? "").trim().slice(0, 100);
  const categoryFilter = uuidOrNull(one(params.category));
  const statusParam = one(params.status) ?? "";
  const status = (STATUSES as readonly string[]).includes(statusParam) ? (statusParam as Status) : null;
  // Admins are always pinned to their own candidates, whatever the URL says.
  const ownerFilter = isSuperadmin ? uuidOrNull(one(params.admin)) : session.sub;
  const isFiltered = Boolean(search || categoryFilter || status || (isSuperadmin && ownerFilter));

  const [{ rows: candidates }, { rows: categories }, { rows: admins }] = await Promise.all([
    pool.query<CandidateRow>(
      `select u.id, u.email, u.category_id, c.name as category_name, cc.name as current_category_name,
              u.admin_id, a.email as admin_email, u.access_expires_at, u.is_blocked
       from users u
       join categories c on c.id = u.category_id
       join categories cc on cc.id = u.current_category_id
       join users a on a.id = u.admin_id
       where u.role = 'candidate'
         and ($1::uuid is null or u.admin_id = $1::uuid)
         and ($2::text is null or u.email ilike '%' || $2::text || '%')
         and ($3::uuid is null or u.category_id = $3::uuid or u.current_category_id = $3::uuid)
         and ($4::text is null
              or ($4::text = 'blocked' and u.is_blocked)
              or ($4::text = 'expired' and not u.is_blocked and u.access_expires_at <= now())
              or ($4::text = 'active' and not u.is_blocked
                  and (u.access_expires_at is null or u.access_expires_at > now())))
       order by u.created_at desc`,
      [ownerFilter, search ? escapeLike(search) : null, categoryFilter, status]
    ),
    pool.query<CategoryChoice>(
      `select c.id, c.name, g.name as "group"
       from categories c join category_groups g on g.id = c.group_id
       order by g.position, c.name`
    ),
    isSuperadmin
      ? pool.query<Option>(`select id, email as label from users where role = 'admin' order by email`)
      : Promise.resolve({ rows: [] as Option[] }),
  ]);

  const now = Date.now();
  const columns = isSuperadmin
    ? ["Email", "Category", "Admin", "Status", "Access until", ""]
    : ["Email", "Category", "Status", "Access until", ""];
  const countLabel = `${candidates.length} candidate${candidates.length === 1 ? "" : "s"}`;

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
        <FilterSearch name="q" label="Search by email" defaultValue={search} />
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
            categoryId: candidate.category_id,
            adminId: candidate.admin_id,
            isBlocked: candidate.is_blocked,
            expiryLabel: expiresAt ? `${isExpired ? "Expired on" : "Expires"} ${expiryDate}` : "No expiry set",
          };

          return (
            <Row key={candidate.id}>
              <Cell kind="primary">
                <Breakable text={candidate.email} />
              </Cell>
              <Cell label="Category">
                {candidate.current_category_name}
                {candidate.current_category_name !== candidate.category_name && (
                  <span className="block text-xs text-slate-600">Assigned: {candidate.category_name}</span>
                )}
              </Cell>
              {isSuperadmin && (
                <Cell label="Admin" breakAnywhere>
                  <Breakable text={candidate.admin_email} />
                </Cell>
              )}
              <Cell label="Status">
                {candidate.is_blocked ? (
                  <Badge tone="danger">Blocked</Badge>
                ) : isExpired ? (
                  <Badge tone="warning">Expired</Badge>
                ) : (
                  <Badge tone="success">Active</Badge>
                )}
              </Cell>
              <Cell label="Access until" nowrap>
                {expiryDate}
              </Cell>
              <Cell kind="actions">
                {isSuperadmin ? (
                  <SuperadminCandidateActions
                    candidate={rowCandidate}
                    admins={admins.map(({ id, label }) => ({ id, email: label }))}
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
    </>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function uuidOrNull(value: string | undefined): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}

// Treat the user's % and _ literally; Postgres LIKE uses backslash as its escape.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
