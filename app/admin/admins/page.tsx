import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { LogoutButton } from "@/components/logout-button";
import { SuperadminNav } from "@/components/superadmin-nav";
import { CreateAdminForm } from "./create-admin-form";
import { AdminItem } from "./admin-item";

interface AdminRow {
  id: string;
  email: string;
  candidate_count: number;
}

export default async function AdminsPage() {
  const session = await requireRole(["superadmin"]);

  const { rows: admins } = await pool.query<AdminRow>(
    `select a.id, a.email, count(c.id)::int as candidate_count
     from users a
     left join users c on c.admin_id = a.id
     where a.role = 'admin'
     group by a.id, a.email, a.created_at
     order by a.created_at desc`
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base uppercase tracking-wide text-primary">
            Superadmin
          </p>
          <h1 className="text-2xl font-semibold text-ink">Admins</h1>
          <p className="mt-1 text-base text-ink/70">
            Signed in as {session.email}
          </p>
        </div>
        <LogoutButton />
      </div>

      <SuperadminNav current="/admin/admins" />

      <CreateAdminForm />

      <div>
        <h2 className="text-lg font-medium text-ink">
          {admins.length} admin{admins.length === 1 ? "" : "s"}
        </h2>
        <ul className="mt-3 divide-y divide-ink/15 rounded-lg border border-ink/15">
          {admins.map((admin) => (
            <AdminItem
              key={admin.id}
              id={admin.id}
              email={admin.email}
              candidateCount={admin.candidate_count}
            />
          ))}
          {admins.length === 0 && (
            <li className="p-4 text-base text-ink/70">No admins yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
