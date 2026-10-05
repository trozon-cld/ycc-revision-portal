import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { loadReaderTextSize } from "@/lib/content/candidate-book";
import { loadMockRun, loadMockSummary } from "@/lib/mock/attempts";
import { isUuid } from "@/lib/ids";
import { FocusedShell } from "@/components/learning/focused-shell";
import { MockEnded } from "./mock-ended";
import { MockRunner } from "./mock-runner";

// The test while it runs; its score and time once it has ended.
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

  // A test removed because nothing was answered before a category change: back to the start page.
  const summary = await loadMockSummary(session.sub, attemptId);
  if (!summary) redirect("/dashboard/mock");
  return (
    <FocusedShell label="Mock test tools" status="Mock test">
      <MockEnded summary={summary} />
    </FocusedShell>
  );
}
