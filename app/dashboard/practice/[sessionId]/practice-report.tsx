import Link from "next/link";
import { ACCESS_TIME_ZONE } from "@/lib/candidates/access";
import type { PracticeReport } from "@/lib/practice/sessions";
import { PageBody } from "@/components/candidate/page-body";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { InlineText } from "@/components/learning/inline-text";
import { practiseAgain } from "../actions";
import { FlagButton } from "../flag-button";
import { ReviewQuestion } from "./review-question";
import { PracticeShell } from "../practice-shell";

const MODE_NAMES: Record<PracticeReport["mode"], string> = {
  smart: "Smart practice",
  chapters: "By chapter",
  types: "By question type",
  all: "All questions",
  retry: "The questions you missed",
  wrong: "Questions I got wrong",
  flagged: "Flagged questions",
  unseen: "Not practised yet",
  weak: "Weak areas",
};

// Encouraging, never pass/fail wording.
function encouragement(percent: number): string {
  if (percent >= 90) return "Excellent work. You’re answering these with confidence.";
  if (percent >= 70) return "Good work. Look over the questions you missed below.";
  if (percent >= 50) return "You’re getting there. Look over the questions you missed, then practise again.";
  return "Keep going. Read the questions you missed below, then try a Smart practice to focus on them.";
}

function timeText(seconds: number): string {
  if (seconds < 60) return "less than a minute";
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export function PracticeReportView({ report, againUnavailable }: { report: PracticeReport; againUnavailable: boolean }) {
  const percent = report.answered ? Math.round((report.rightCount / report.answered) * 100) : 0;
  const date = new Date(report.finishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: ACCESS_TIME_ZONE });
  const what = report.choiceNames.length ? `${MODE_NAMES[report.mode]}: ${report.choiceNames.join(", ")}` : MODE_NAMES[report.mode];
  const endedEarly = report.answered + report.skipped < report.total;

  return (
    <PracticeShell status="Your results">
      <PageBody>
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold text-ink">Your practice results</h1>
          <p className="mt-2 text-base text-ink/80 [overflow-wrap:anywhere]">
            {report.categoryName} · {what} · {date}
          </p>

          <section aria-label="Score" className="mt-6 rounded-xl border-2 border-primary/30 bg-primary/5 p-5 sm:p-6">
            <p className="text-ink">
              <span className="text-5xl font-bold">{report.rightCount}</span>
              <span className="text-2xl font-semibold"> of {report.answered} right</span>
            </p>
            {report.answered > 0 && <p className="mt-1 text-xl font-semibold text-ink">{percent}%</p>}
            <p className="mt-3 text-lg leading-relaxed text-ink">{report.answered > 0 ? encouragement(percent) : "No questions were answered."}</p>
            {endedEarly && (
              <p className="mt-2 text-base text-ink/80">
                You ended this practice after answering {report.answered} of {report.total} questions.
              </p>
            )}
            {report.skipped > 0 && (
              <p className="mt-2 text-base text-ink/80">
                {report.skipped === 1 ? "1 question was" : `${report.skipped} questions were`} taken out of Practice while you were answering, so not
                counted.
              </p>
            )}
            <p className="mt-2 text-base text-ink/80">Time spent: {timeText(report.secondsSpent)}</p>
          </section>

          {againUnavailable && (
            <p role="alert" className="mt-6 rounded-xl border-2 border-red-700 bg-red-50 p-4 text-lg font-semibold text-red-800">
              These questions can’t be practised again right now. Try a new practice instead.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {report.canRetry && report.wrong && (
              <form action={practiseAgain}>
                <input type="hidden" name="sessionId" value={report.id} />
                <button type="submit" className={`${PRIMARY_BUTTON} w-full`}>
                  Practise these {report.wrong.length} again
                </button>
              </form>
            )}
            <Link href="/dashboard/practice" className={report.canRetry ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
              New practice
            </Link>
            <Link href="/dashboard" className={SECONDARY_BUTTON}>
              Back to home
            </Link>
          </div>

          {report.chapters.length > 0 && (
            <section aria-labelledby="chapters-heading" className="mt-10">
              <h2 id="chapters-heading" className="text-2xl font-bold text-ink">
                By chapter
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {report.chapters.map((chapter) => (
                  <li key={chapter.label} className="rounded-xl border-2 border-ink/15 bg-white p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="min-w-0 text-lg font-semibold text-ink [overflow-wrap:anywhere]">{chapter.label}</span>
                      <span className="text-lg text-ink">
                        {chapter.right} of {chapter.answered} right
                      </span>
                    </div>
                    <div aria-hidden="true" className="mt-2 h-3 overflow-hidden rounded-full bg-ink/10">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(chapter.right / chapter.answered) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.wrong && report.answered > 0 && (
            <section aria-labelledby="review-heading" className="mt-10">
              <h2 id="review-heading" className="text-2xl font-bold text-ink">
                Questions to look at again
              </h2>
              {report.wrong.length === 0 ? (
                <p className="mt-3 text-lg text-ink">You got every question right. Well done.</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {report.wrong.map((item, index) => (
                    <li key={`${item.question.id}:${index}`}>
                      <details className="group rounded-xl border-2 border-ink/15 bg-white open:border-primary/40">
                        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0 flex-1">
                            <span className="block text-base text-ink/80 [overflow-wrap:anywhere]">{item.chapterLabel}</span>
                            <span className="block text-lg font-semibold text-ink [overflow-wrap:anywhere]">
                              <InlineText text={item.question.stemText} />
                            </span>
                          </span>
                          <span className="shrink-0 rounded-lg border-2 border-primary px-3 py-2 text-base font-semibold text-primary">
                            <span className="group-open:hidden">See answer</span>
                            <span className="hidden group-open:inline">Hide</span>
                          </span>
                        </summary>
                        <div className="border-t border-ink/15 px-4 py-5 text-[18px] text-ink">
                          <ReviewQuestion question={item.question} checked={item.checked} media={report.media} />
                          {report.canRetry && <FlagButton questionId={item.question.id} initialFlagged={item.flagged} className="mt-5" />}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </PageBody>
    </PracticeShell>
  );
}
