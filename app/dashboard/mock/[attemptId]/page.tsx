import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { loadMockRun } from "@/lib/mock/attempts";
import { timeLeftText } from "@/lib/mock/types";
import { isUuid } from "@/lib/ids";
import { PageBody } from "@/components/candidate/page-body";
import { PRIMARY_BUTTON } from "@/components/candidate/buttons";
import { FocusedShell } from "@/components/learning/focused-shell";

// Placeholder until the test screen (E5a-2) and the end of the test (E5a-3).
export default async function MockAttemptPage({ params }: PageProps<"/dashboard/mock/[attemptId]">) {
  const session = await requireRole(["candidate"]);
  const { attemptId } = await params;
  if (!isUuid(attemptId)) notFound();
  const view = await loadMockRun(session.sub, attemptId);
  if (view.kind === "missing") notFound();

  return (
    <FocusedShell label="Mock test tools" status="Mock test">
      <PageBody>
        <div className="max-w-2xl">
          {view.kind === "running" ? (
            <>
              <h1 className="text-3xl font-bold text-ink">Your mock test has started</h1>
              <p className="mt-3 text-lg text-ink">
                {timeLeftText(view.run.secondsLeft)} · {view.run.total} questions
              </p>
              <p className="mt-3 text-base text-ink/80">Placeholder: the question screen comes in the next step (E5a-2).</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-ink">This mock test has finished</h1>
              <p className="mt-3 text-base text-ink/80">Placeholder: your results come in a later step (E5a-3).</p>
            </>
          )}
          <Link href="/dashboard" className={`${PRIMARY_BUTTON} mt-8 w-full sm:w-auto`}>
            Back to home
          </Link>
        </div>
      </PageBody>
    </FocusedShell>
  );
}
