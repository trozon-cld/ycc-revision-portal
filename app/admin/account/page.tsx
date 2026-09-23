import { requireRole } from "@/lib/auth/guard";
import { LogoutButton } from "@/components/logout-button";
import { AreaNav } from "@/components/area-nav";
import { ChangeEmailForm, ChangePasswordForm } from "./account-forms";

export default async function AccountPage() {
  const session = await requireRole(["superadmin"]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base uppercase tracking-wide text-primary">
            Superadmin
          </p>
          <h1 className="text-2xl font-semibold text-ink">My account</h1>
          <p className="mt-1 break-all text-base text-ink/70">
            Signed in as {session.email}
          </p>
        </div>
        <LogoutButton />
      </div>

      <AreaNav role="superadmin" current="/admin/account" />

      <ChangeEmailForm currentEmail={session.email} />
      <ChangePasswordForm />
    </div>
  );
}
