import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { PageHeader } from "@/components/admin/page-header";
import { cardClass } from "@/components/admin/styles";
import { ChangeEmailForm, ChangeNameForm, ChangePasswordForm } from "./account-forms";

// Admins can set their own name here; their email and password are managed by the Superadmin.
export default async function AccountPage() {
  const session = await requireRole(["superadmin", "admin"]);
  const isSuperadmin = session.role === "superadmin";
  const { rows } = await pool.query<{ full_name: string | null; email: string }>(
    `select full_name, email from users where id = $1`,
    [session.sub]
  );
  const me = rows[0];

  return (
    <>
      <PageHeader title="My account" description={me?.email ?? session.email} />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-4 text-base font-semibold text-ink">Name</h2>
          <ChangeNameForm currentName={me?.full_name ?? null} />
        </section>
        {isSuperadmin && (
          <>
            <section className={`${cardClass} p-5`}>
              <h2 className="mb-4 text-base font-semibold text-ink">Change email</h2>
              <ChangeEmailForm currentEmail={session.email} />
            </section>
            <section className={`${cardClass} p-5`}>
              <h2 className="mb-4 text-base font-semibold text-ink">Change password</h2>
              <ChangePasswordForm />
            </section>
          </>
        )}
      </div>
    </>
  );
}
