import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { customDateBounds, formatUkDate } from "@/lib/candidates/access";
import { LogoutButton } from "@/components/logout-button";
import { AreaNav } from "@/components/area-nav";
import { CreateCandidateForm } from "./create-candidate-form";
import { ChangeAdmin } from "./change-admin";
import { CandidateManager } from "./candidate-manager";

interface CandidateRow {
  id: string;
  email: string;
  category_id: string;
  category_name: string;
  admin_id: string;
  admin_email: string;
  access_expires_at: string | null;
  is_blocked: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
}

interface AdminOption {
  id: string;
  email: string;
}

export default async function CandidatesPage() {
  const session = await requireRole(["admin", "superadmin"]);
  const isSuperadmin = session.role === "superadmin";
  const { min: minDate, max: maxDate } = customDateBounds();
  const now = Date.now();

  // Admins only ever see their own candidates; Superadmin sees all.
  const [{ rows: candidates }, { rows: categories }, { rows: admins }] = await Promise.all([
    pool.query<CandidateRow>(
      `select u.id, u.email, u.category_id, c.name as category_name, u.admin_id,
              a.email as admin_email, u.access_expires_at, u.is_blocked
       from users u
       join categories c on c.id = u.category_id
       join users a on a.id = u.admin_id
       where u.role = 'candidate'
         and ($1::uuid is null or u.admin_id = $1::uuid)
       order by u.created_at desc`,
      [isSuperadmin ? null : session.sub]
    ),
    isSuperadmin
      ? Promise.resolve({ rows: [] as CategoryRow[] })
      : pool.query<CategoryRow>(`select id, name from categories order by name`),
    isSuperadmin
      ? pool.query<AdminOption>(`select id, email from users where role = 'admin' order by email`)
      : Promise.resolve({ rows: [] as AdminOption[] }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base uppercase tracking-wide text-primary">
            {isSuperadmin ? "Superadmin" : "Admin"}
          </p>
          <h1 className="text-2xl font-semibold text-ink">Candidates</h1>
          <p className="mt-1 text-base text-ink/70">
            Signed in as {session.email}
          </p>
        </div>
        <LogoutButton />
      </div>

      <AreaNav role={isSuperadmin ? "superadmin" : "admin"} current="/admin/candidates" />

      {!isSuperadmin && categories.length === 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
          No categories are available yet. A category is needed before a
          candidate can be created.
        </p>
      )}

      {!isSuperadmin && (
        <CreateCandidateForm categories={categories} minDate={minDate} maxDate={maxDate} />
      )}

      <div>
        <h2 className="text-lg font-medium text-ink">
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        </h2>
        <ul className="mt-3 divide-y divide-ink/15 rounded-lg border border-ink/15">
          {candidates.map((candidate) => {
            const expiresAt = candidate.access_expires_at;
            const isExpired = expiresAt !== null && new Date(expiresAt).getTime() <= now;
            const expiryLabel = expiresAt
              ? `${isExpired ? "Expired on" : "Expires"} ${formatUkDate(expiresAt)}`
              : "No expiry set";

            return (
              <li key={candidate.id} className="space-y-3 p-4 text-base text-ink">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="break-all font-medium">{candidate.email}</p>
                    <p className="text-ink/70">{candidate.category_name}</p>
                    {isSuperadmin && (
                      <p className="break-all text-ink/70">Admin: {candidate.admin_email}</p>
                    )}
                  </div>
                  <div className="sm:text-right">
                    {candidate.is_blocked && (
                      <p className="font-medium text-red-700">Blocked</p>
                    )}
                    <p className={isExpired ? "font-medium text-red-700" : "text-ink/70"}>
                      {expiryLabel}
                    </p>
                  </div>
                </div>
                {isSuperadmin ? (
                  <ChangeAdmin
                    candidateId={candidate.id}
                    currentAdminId={candidate.admin_id}
                    admins={admins}
                  />
                ) : (
                  <CandidateManager
                    candidate={{
                      id: candidate.id,
                      email: candidate.email,
                      categoryId: candidate.category_id,
                      isBlocked: candidate.is_blocked,
                      expiryLabel,
                    }}
                    categories={categories}
                    minDate={minDate}
                    maxDate={maxDate}
                  />
                )}
              </li>
            );
          })}
          {candidates.length === 0 && (
            <li className="p-4 text-base text-ink/70">
              No candidates yet.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
