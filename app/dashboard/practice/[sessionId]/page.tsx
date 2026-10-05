import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { loadReaderTextSize } from "@/lib/content/candidate-book";
import { loadPracticeReport, loadPracticeView } from "@/lib/practice/sessions";
import { isUuid } from "@/lib/ids";
import { PracticeReportView } from "./practice-report";
import { PracticeRunner } from "./practice-runner";

// A practice run: the current question while it's going, the report once it's finished.
export default async function PracticeRunPage({ params, searchParams }: PageProps<"/dashboard/practice/[sessionId]">) {
  const session = await requireRole(["candidate"]);
  const { sessionId } = await params;
  if (!isUuid(sessionId)) notFound();

  const view = await loadPracticeView(session.sub, sessionId);
  if (view.kind === "missing") notFound();
  if (view.kind === "closed") redirect("/dashboard/practice");

  if (view.kind === "report") {
    const report = await loadPracticeReport(session.sub, sessionId);
    if (!report) notFound();
    const again = (await searchParams).again;
    return <PracticeReportView report={report} againUnavailable={again === "unavailable"} />;
  }

  const textSize = await loadReaderTextSize(session.sub);
  return <PracticeRunner key={view.step.sessionId} initialStep={view.step} initialTextSize={textSize} />;
}
