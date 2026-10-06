import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { loadReaderTextSize } from "@/lib/content/candidate-book";
import { loadMockResults, loadMockRun } from "@/lib/mock/attempts";
import { isUuid } from "@/lib/ids";
import { FocusedShell } from "@/components/learning/focused-shell";
import { MockResultsView } from "./mock-results";
import { MockRunner } from "./mock-runner";

// The test while it runs; its results once it has ended.
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
  const results = await loadMockResults(session.sub, attemptId);
  if (!results) redirect("/dashboard/mock");
  return (
    <FocusedShell label="Mock test tools" status="Your results">
      <MockResultsView attemptId={attemptId} results={results} />
    </FocusedShell>
  );
}
