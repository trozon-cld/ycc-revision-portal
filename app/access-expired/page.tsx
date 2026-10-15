import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { LogoutButton } from "@/components/logout-button";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { getLiveSession, hasAccess } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Access ended" };

export default async function AccessExpiredPage() {
  if (!(await getSession())) redirect("/login");
  const live = await getLiveSession();
  if (!live) redirect(SESSION_ENDED_LOGIN);
  // Unblocked or extended since: straight back in.
  if (live.account.role !== "candidate") redirect("/admin");
  if (hasAccess(live.account)) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-page p-4 text-center">
      <h1 className="text-3xl font-bold text-ink">
        Your access has ended
      </h1>
      <p className="max-w-sm text-lg text-muted">
        Your revision access is no longer active. Please contact your Admin
        to extend or reactivate it.
      </p>
      <LogoutButton className={SECONDARY_BUTTON} />
    </main>
  );
}
