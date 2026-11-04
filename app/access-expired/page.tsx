import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CARD, PAGE_TITLE, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { LogoutButton } from "@/components/logout-button";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { getSignedInAccount, hasAccess } from "@/lib/auth/guard";
import { getSession } from "@/lib/auth/session";
import { PageLogo } from "@/components/candidate/page-logo";

export const metadata: Metadata = { title: "Access Ended" };

export default async function AccessExpiredPage() {
  if (!(await getSession())) redirect("/login");
  const live = await getSignedInAccount();
  if (!live) redirect(SESSION_ENDED_LOGIN);
  // Unblocked or extended since: straight back in.
  if (live.account.role !== "candidate") redirect("/admin");
  if (hasAccess(live.account)) redirect("/dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-page p-4">
      <PageLogo />
      <div className={`${CARD} flex w-full max-w-md flex-col items-center gap-4 p-6 text-center sm:p-8`}>
        <h1 className={`${PAGE_TITLE}`}>
          Your access has ended
        </h1>
        <p className="text-base text-muted">
          Your revision access is no longer active. Please contact your Admin
          to extend or reactivate it.
        </p>
        <LogoutButton className={SECONDARY_BUTTON} />
      </div>
    </main>
  );
}
