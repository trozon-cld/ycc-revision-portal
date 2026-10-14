import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guard";
import { pool } from "@/lib/db/pool";
import { PageHeader } from "@/components/admin/page-header";
import { buttonClass, cardClass } from "@/components/admin/styles";
import { LogoutEverywhere, type LogoutEverywhereStyles } from "@/components/logout-everywhere";
import { ChangeEmailForm, ChangeNameForm, ChangePasswordForm } from "./account-forms";

export const metadata: Metadata = { title: "My account" };

const LOGOUT_EVERYWHERE: LogoutEverywhereStyles = {
  button: buttonClass("secondary"),
  yes: buttonClass("primary"),
  cancel: buttonClass("secondary"),
  box: "rounded-md border border-primary/40 bg-primary/5 p-4",
  heading: "text-sm font-semibold text-ink focus:outline-none",
  text: "mt-1 text-sm text-slate-700",
  error: "mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800",
};

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

      <div className="grid gap-4 md:max-w-2xl">
        <section className={`${cardClass} p-5`}>
          <h2 className="mb-4 text-base font-semibold text-ink">Change name</h2>
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
        <section className={`${cardClass} p-5`}>
          <h2 className="text-base font-semibold text-ink">Sign-ins</h2>
          <p className="mt-1 mb-4 text-sm text-slate-700">Signed in on a shared or lost device? Log out everywhere at once. The usual Log out only ends this browser’s sign-in.</p>
          <LogoutEverywhere styles={LOGOUT_EVERYWHERE} />
        </section>
      </div>
    </>
  );
}
