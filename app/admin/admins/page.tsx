import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { formatUkDate } from "@/lib/candidates/access";
import { Breakable } from "@/components/admin/breakable";
import { PageHeader } from "@/components/admin/page-header";
import { Cell, Row, Table } from "@/components/admin/table";
import { AdminRowActions, NewAdminButton } from "./admin-row-actions";

interface AdminRow {
  id: string;
  email: string;
  candidate_count: number;
  created_at: string;
}

export default async function AdminsPage() {
  await requireRole(["superadmin"]);

  const { rows: admins } = await pool.query<AdminRow>(
    `select a.id, a.email, count(c.id)::int as candidate_count, a.created_at
     from users a
     left join users c on c.admin_id = a.id
     where a.role = 'admin'
     group by a.id, a.email, a.created_at
     order by a.created_at desc`
  );

  return (
    <>
      <PageHeader
        title="Admins"
        description={`${admins.length} admin${admins.length === 1 ? "" : "s"}`}
        actions={<NewAdminButton />}
      />

      <Table columns={["Email", "Candidates", "Created", ""]} isEmpty={admins.length === 0} emptyMessage="No admins yet.">
        {admins.map((admin) => (
          <Row key={admin.id}>
            <Cell kind="primary">
              <Breakable text={admin.email} />
            </Cell>
            <Cell label="Candidates">{admin.candidate_count}</Cell>
            <Cell label="Created" nowrap>{formatUkDate(admin.created_at)}</Cell>
            <Cell kind="actions">
              <AdminRowActions id={admin.id} email={admin.email} candidateCount={admin.candidate_count} />
            </Cell>
          </Row>
        ))}
      </Table>
    </>
  );
}
