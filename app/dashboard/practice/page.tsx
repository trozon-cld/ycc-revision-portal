import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { loadOpenPractice, loadPracticeOptions } from "@/lib/practice/sessions";
import { PageBody } from "@/components/candidate/page-body";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { PracticeSetup } from "./practice-setup";
import { PracticeShell } from "./practice-shell";

export default async function PracticePage() {
  const session = await requireRole(["candidate"]);
  // A run from another category is closed first, so the setup below always matches the open one.
  const open = await loadOpenPractice(session.sub);
  const options = await loadPracticeOptions(session.sub);
  if (!options) redirect(SESSION_ENDED_LOGIN);

  return (
    <PracticeShell status="Practice">
      <PageBody>
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-ink">Practice</h1>
          <p className="mt-3 text-lg leading-relaxed text-ink">
            Answer questions at your own pace. After each one you’ll see the right answer and why.
          </p>
          <p className="mt-1 text-base text-ink/80 [overflow-wrap:anywhere]">Questions for {options.categoryName}</p>

          {open && (
            <section aria-labelledby="open-heading" className="mt-6 rounded-xl border-2 border-primary bg-primary/5 p-5">
              <h2 id="open-heading" className="text-xl font-bold text-ink">
                Practice in progress
              </h2>
              <p className="mt-1 text-lg text-ink">
                Question {Math.min(open.position + 1, open.total)} of {open.total} · {open.answered} answered
              </p>
              <Link href={`/dashboard/practice/${open.id}`} className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
                Continue practice
              </Link>
              <p className="mt-3 text-base text-ink/80">Starting a new practice below ends this one and keeps your results so far.</p>
            </section>
          )}

          {options.total === 0 ? (
            <div className="mt-8">
              <p className="text-lg leading-relaxed text-ink">There are no practice questions for {options.categoryName} yet. Please check back soon.</p>
              <Link href="/dashboard" className={`${PRIMARY_BUTTON} mt-6`}>
                Back to home
              </Link>
            </div>
          ) : (
            <>
              <PracticeSetup options={options} hasOpen={Boolean(open)} />
              <Link href="/dashboard" className={`${SECONDARY_BUTTON} mt-3 w-full sm:w-auto`}>
                Back to home
              </Link>
            </>
          )}
        </div>
      </PageBody>
    </PracticeShell>
  );
}
