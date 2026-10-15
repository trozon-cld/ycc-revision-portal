import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { formatUkDate } from "@/lib/candidates/access";
import { loadCandidateHome } from "@/lib/candidates/home";
import { PageBody } from "@/components/candidate/page-body";
import { CARD, ERROR_BOX, NOTE_BOX, PAGE_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON, SECTION_TITLE } from "@/components/candidate/buttons";
import { LogoutButton } from "@/components/logout-button";
import { LogoutEverywhere, type LogoutEverywhereStyles } from "@/components/logout-everywhere";

export const metadata: Metadata = { title: "Account" };

const LOGOUT_EVERYWHERE: LogoutEverywhereStyles = {
  button: `${SECONDARY_BUTTON} w-full sm:w-auto`,
  yes: `${PRIMARY_BUTTON} w-full sm:w-auto`,
  cancel: `${SECONDARY_BUTTON} w-full sm:w-auto`,
  box: `${NOTE_BOX} p-4 lg:p-5`,
  heading: "text-xl font-bold text-ink focus:outline-none",
  text: "mt-2 text-base leading-relaxed text-ink",
  error: `${ERROR_BOX} mt-4`,
};

const ROW = "flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0";
const LABEL = "text-base font-semibold text-muted";
const VALUE = "text-base text-ink [overflow-wrap:anywhere]";

// Account: who you are, what you're studying, until when, and signing out (read only; nothing here is logged).
export default async function AccountPage() {
  const session = await requireRole(["candidate"]);
  const home = await loadCandidateHome(session.sub);
  if (!home) redirect(SESSION_ENDED_LOGIN);

  return (
    <PageBody>
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 className={`${PAGE_TITLE}`}>Account</h1>

        <section aria-labelledby="details-heading" className={`${CARD} p-4 lg:p-5`}>
          <h2 id="details-heading" className={`mb-3 ${SECTION_TITLE}`}>
            Your details
          </h2>
          <dl className="divide-y divide-line-soft">
            <div className={ROW}>
              <dt className={LABEL}>Name</dt>
              <dd className={VALUE}>{home.name ?? "Not set"}</dd>
            </div>
            <div className={ROW}>
              <dt className={LABEL}>Email</dt>
              <dd className={VALUE}>{home.email}</dd>
            </div>
            <div className={ROW}>
              <dt className={LABEL}>Access until</dt>
              <dd className={VALUE}>{home.accessExpiresAt ? formatUkDate(home.accessExpiresAt, "long") : "No end date"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-base text-muted">To change these, please contact your Admin.</p>
        </section>

        <section aria-labelledby="category-heading" className={`${CARD} p-4 lg:p-5`}>
          <h2 id="category-heading" className={`${SECTION_TITLE}`}>
            Your category
          </h2>
          <p className="mt-2 text-xl font-bold text-ink [overflow-wrap:anywhere]">{home.current.name}</p>
          <p className="mt-1 text-base text-muted">Group: {home.current.groupName}</p>
          {home.choices > 1 && (
            <Link href="/dashboard/category" className={`${SECONDARY_BUTTON} mt-4 w-full sm:w-auto`}>
              Change category
            </Link>
          )}
        </section>

        <section aria-labelledby="signins-heading" className={`${CARD} p-4 lg:p-5`}>
          <h2 id="signins-heading" className={`${SECTION_TITLE}`}>
            Your sign-ins
          </h2>
          <div className="mt-4">
            <LogoutButton className={`${PRIMARY_BUTTON} w-full sm:w-auto`} />
          </div>
          <p className="mt-5 lg:mt-6 mb-4 text-base text-ink">Logged in on a shared phone or computer, or one you’ve lost? You can log out of every device at once.</p>
          <LogoutEverywhere styles={LOGOUT_EVERYWHERE} />
        </section>

        <div>
          <Link href="/dashboard" className={`${SECONDARY_BUTTON} w-full sm:w-auto`}>
            Back to home
          </Link>
        </div>
      </div>
    </PageBody>
  );
}
