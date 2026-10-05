import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { loadReaderTextSize } from "@/lib/content/candidate-book";
import { loadMockRun } from "@/lib/mock/attempts";
import { isUuid } from "@/lib/ids";
import { PageBody } from "@/components/candidate/page-body";
import { PRIMARY_BUTTON } from "@/components/candidate/buttons";
import { FocusedShell } from "@/components/learning/focused-shell";
import { MockRunner } from "./mock-runner";

// The test while it runs; a placeholder once it has ended, until the end of the test is built (E5a-3).
export default async function MockAttemptPage({ params }: PageProps<"/dashboard/mock/[attemptId]">) {
  const session = await requireRole(["candidate"]);
  const { attemptId } = await params;
  if (!isUuid(attemptId)) notFound();
  const view = await loadMockRun(session.sub, attemptId);
  if (view.kind === "missing") notFound();

  if (view.kind === "running") {
    const textSize = await loadReaderTextSize(session.sub);
    return <MockRunner key={view.run.attemptId} run={view.run} initialTextSize={textSize} />;
  }

  return (
    <FocusedShell label="Mock test tools" status="Mock test">
      <PageBody>
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-ink">This mock test has finished</h1>
          <p className="mt-3 text-base text-ink/80">Placeholder: your results come in a later step (E5a-3).</p>
          <Link href="/dashboard" className={`${PRIMARY_BUTTON} mt-8 w-full sm:w-auto`}>
            Back to home
          </Link>
        </div>
      </PageBody>
    </FocusedShell>
  );
}
