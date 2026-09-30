import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { getLiveSession, hasAccess } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";

export default async function AccessExpiredPage() {
  if (!(await getSession())) redirect("/login");
  const live = await getLiveSession();
  if (!live) redirect(SESSION_ENDED_LOGIN);
  // Unblocked or extended since: straight back in.
  if (live.account.role !== "candidate") redirect("/admin");
  if (hasAccess(live.account)) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold text-ink">
        Your access has ended
      </h1>
      <p className="max-w-sm text-base text-ink/70">
        Your revision access is no longer active. Please contact your Admin
        to extend or reactivate it.
      </p>
      <LogoutButton />
    </div>
  );
}
