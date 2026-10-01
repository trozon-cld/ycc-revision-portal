import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { DEFAULT_TEXT_SIZE, TEXT_SIZES } from "@/lib/content/book";
import { isUuid } from "@/lib/content/pages";
import { pool } from "@/lib/db/pool";
import { loadPracticeReport, loadPracticeView } from "@/lib/practice/sessions";
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

  const { rows } = await pool.query<{ reader_text_size: number | null }>(`select reader_text_size from users where id = $1`, [session.sub]);
  const textSize = TEXT_SIZES.find((size) => size === rows[0]?.reader_text_size) ?? DEFAULT_TEXT_SIZE;
  return <PracticeRunner key={view.step.sessionId} initialStep={view.step} initialTextSize={textSize} />;
}
