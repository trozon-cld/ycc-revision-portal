import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CARD, PAGE_TITLE, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { LogoutButton } from "@/components/logout-button";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { getSignedInAccount, isOffNetwork } from "@/lib/auth/guard";
import { OFFICE_ONLY_MESSAGE } from "@/lib/auth/office-network";
import { getSession } from "@/lib/auth/session";
import { ipFromHeaders } from "@/lib/audit/log";

export const metadata: Metadata = { title: "Office network only" };

// Where an Admin outside the office network lands. Back in the office (or exempt, or the check off): straight back in.
export default async function OfficeNetworkOnlyPage() {
  if (!(await getSession())) redirect("/login");
  const live = await getSignedInAccount();
  if (!live) redirect(SESSION_ENDED_LOGIN);
  if (!(await isOffNetwork(live.account))) redirect(live.account.role === "candidate" ? "/dashboard" : "/admin");
  const address = ipFromHeaders(await headers());

  return (
    <main className="flex flex-1 items-center justify-center bg-page p-4">
      <div className={`${CARD} flex w-full max-w-md flex-col items-center gap-4 p-6 text-center sm:p-8`}>
        <h1 className={PAGE_TITLE}>Office network only</h1>
        <p className="text-base text-muted">{OFFICE_ONLY_MESSAGE}</p>
        <p className="text-base text-muted">
          If you need access from somewhere else, ask the Superadmin.
          {address && (
            <>
              {" "}
              Your current address is <span className="font-semibold text-ink [overflow-wrap:anywhere]">{address}</span>.
            </>
          )}
        </p>
        <LogoutButton className={SECONDARY_BUTTON} />
      </div>
    </main>
  );
}
