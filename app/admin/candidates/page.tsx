import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { LogoutButton } from "@/components/logout-button";
import { CreateCandidateForm } from "./create-candidate-form";

interface CandidateRow {
  id: string;
  email: string;
  category_name: string | null;
  access_expires_at: string | null;
  is_blocked: boolean;
  created_at: string;
}

interface CategoryRow {
  id: string;
  name: string;
}

export default async function CandidatesPage() {
  const session = await requireRole(["admin"]);

  const [{ rows: candidates }, { rows: categories }] = await Promise.all([
    pool.query<CandidateRow>(
      `select u.id, u.email, c.name as category_name, u.access_expires_at, u.is_blocked, u.created_at
       from users u
       left join categories c on c.id = u.category_id
       where u.role = 'candidate'
       order by u.created_at desc`
    ),
    pool.query<CategoryRow>(`select id, name from categories order by name`),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base uppercase tracking-wide text-primary">
            Admin
          </p>
          <h1 className="text-2xl font-semibold text-ink">Candidates</h1>
          <p className="mt-1 text-base text-ink/70">
            Signed in as {session.email}
          </p>
        </div>
        <LogoutButton />
      </div>

      {categories.length === 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-base text-amber-900">
          No categories are available yet. A category is needed before a
          candidate can be created.
        </p>
      )}

      <CreateCandidateForm categories={categories} />

      <div>
        <h2 className="text-lg font-medium text-ink">
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
        </h2>
        <ul className="mt-3 divide-y divide-ink/15 rounded-lg border border-ink/15">
          {candidates.map((candidate) => (
            <li
              key={candidate.id}
              className="flex flex-col gap-1 p-4 text-base text-ink sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{candidate.email}</p>
                <p className="text-ink/70">
                  {candidate.category_name ?? "No category"}
                </p>
              </div>
              <div className="text-ink/70">
                {candidate.is_blocked ? (
                  <span className="text-red-700">Blocked</span>
                ) : candidate.access_expires_at ? (
                  <>
                    Expires{" "}
                    {new Date(candidate.access_expires_at).toLocaleDateString(
                      "en-GB"
                    )}
                  </>
                ) : null}
              </div>
            </li>
          ))}
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
