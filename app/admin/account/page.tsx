import { requireRole } from "@/lib/auth/guard";
import { PageHeader } from "@/components/admin/page-header";
import { cardClass } from "@/components/admin/styles";
import { ChangeEmailForm, ChangePasswordForm } from "./account-forms";

export default async function AccountPage() {
  const session = await requireRole(["superadmin"]);

  return (
    <>
      <PageHeader title="My account" description={session.email} />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-4 text-base font-semibold text-ink">Change email</h2>
          <ChangeEmailForm currentEmail={session.email} />
        </section>
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-4 text-base font-semibold text-ink">Change password</h2>
          <ChangePasswordForm />
        </section>
      </div>
    </>
  );
}
