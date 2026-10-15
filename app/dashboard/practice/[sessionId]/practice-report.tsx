import Link from "next/link";
import { formatUkDate } from "@/lib/candidates/access";
import type { PracticeReport } from "@/lib/practice/sessions";
import { PageBody } from "@/components/candidate/page-body";
import { BAR_FILL, BAR_TRACK, CARD, ERROR_BOX, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { Icon } from "@/components/icons";
import { ArrivalHeading } from "@/components/candidate/arrival-heading";
import { ChapterResults } from "@/components/candidate/chapter-results";
import { InlineText } from "@/components/learning/inline-text";
import { ReviewQuestion } from "@/components/learning/questions/review-question";
import { FocusedShell } from "@/components/learning/focused-shell";
import { practiseAgain } from "../actions";
import { FlagButton } from "../flag-button";
import { RetryForm } from "./retry-button";

const MODE_NAMES: Record<PracticeReport["mode"], string> = {
  smart: "Smart practice",
  chapters: "By chapter",
  types: "By question type",
  all: "All questions",
  retry: "The questions you missed",
  mock: "Missed in a mock test",
  wrong: "Questions I got wrong",
  flagged: "Flagged questions",
  unseen: "Not practised yet",
  weak: "Weak chapters",
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
  const date = formatUkDate(report.finishedAt, "long");
  const what = report.choiceNames.length ? `${MODE_NAMES[report.mode]}: ${report.choiceNames.join(", ")}` : MODE_NAMES[report.mode];
  const notAll = report.answered + report.skipped < report.total;

  return (
    <FocusedShell label="Practice tools" status="Your results">
      <PageBody>
        <div className="max-w-3xl">
          <ArrivalHeading className="text-3xl font-bold text-ink">Your practice results</ArrivalHeading>
          <p className="mt-2 text-base text-muted [overflow-wrap:anywhere]">
            {report.categoryName} · {what} · {date}
          </p>

          <section aria-labelledby="score-heading" className={`mt-6 ${CARD} p-5 sm:p-6`}>
            <div className="flex items-center gap-3">
              {report.answered > 0 && (
                <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-ok-bg text-ok">
                  <Icon name="tick" />
                </span>
              )}
              <h2 id="score-heading" className="text-base font-semibold text-muted">
                Your score
              </h2>
            </div>
            <p className="mt-1 text-ink">
              <span className="text-5xl font-bold">{report.rightCount}</span>
              <span className="text-2xl font-semibold"> of {report.answered} right</span>
            </p>
            {report.answered > 0 && (
              <>
                <p className="mt-1 text-xl font-semibold text-ink">{percent}%</p>
                <div aria-hidden="true" className={`${BAR_TRACK} mt-3 h-4`}>
                  <div className={BAR_FILL} style={{ width: `${percent}%` }} />
                </div>
              </>
            )}
            <p className="mt-3 text-lg leading-relaxed text-ink">{report.answered > 0 ? encouragement(percent) : "No questions were answered."}</p>
            {notAll && (
              <p className="mt-2 text-base text-muted">
                {report.detailsKept
                  ? `You ended this practice after answering ${report.answered} of ${report.total} questions.`
                  : `You answered ${report.answered} of ${report.total} questions.`}
              </p>
            )}
            {report.skipped > 0 && (
              <p className="mt-2 text-base text-muted">
                {report.skipped === 1 ? "1 question was" : `${report.skipped} questions were`} taken out of Practice while you were answering, so not
                counted.
              </p>
            )}
            <p className="mt-2 text-base text-muted">Time spent: {timeText(report.secondsSpent)}</p>
          </section>

          {againUnavailable && (
            <p role="alert" className={`mt-6 ${ERROR_BOX}`}>
              These questions can’t be practised again right now. Try a new practice instead.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {report.canRetry && report.wrong && (
              <RetryForm action={practiseAgain} field="sessionId" value={report.id} count={report.wrong.length} />
            )}
            <Link href="/dashboard/practice" className={report.canRetry ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
              New practice
            </Link>
            <Link href="/dashboard" className={SECONDARY_BUTTON}>
              Back to home
            </Link>
          </div>

          {report.chapters.length > 0 && (
            <ChapterResults
              id="chapters-heading"
              title="By chapter"
              items={report.chapters.map((chapter) => ({ key: chapter.label, label: chapter.label, right: chapter.right, outOf: chapter.answered }))}
            />
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
                      <details className={`group ${CARD} open:border-primary/40`}>
                        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0 flex-1">
                            <span className="block text-base text-muted [overflow-wrap:anywhere]">{item.chapterLabel}</span>
                            <span className="block text-lg font-semibold text-ink [overflow-wrap:anywhere]">
                              <InlineText text={item.question.stemText} />
                            </span>
                          </span>
                          <span className="shrink-0 rounded-xl border-2 border-primary px-3 py-2 text-base font-semibold text-primary">
                            <span className="group-open:hidden">See answer</span>
                            <span className="hidden group-open:inline">Hide</span>
                          </span>
                        </summary>
                        <div className="border-t border-ink/15 px-4 py-5 text-[18px] text-ink">
                          <ReviewQuestion
                            question={item.question}
                            seed={`${report.id}:${item.question.id}`}
                            label="Correct answer"
                            media={report.media}
                            answer={item.checked.answer}
                            explanation={item.checked.explanation}
                          />
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
    </FocusedShell>
  );
}
