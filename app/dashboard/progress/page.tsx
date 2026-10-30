import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { countOf } from "@/lib/format";
import { settleOwnMocks } from "@/lib/mock/attempts";
import { donePercent, MOCK_HISTORY_STEP, scorePercent, scoreText } from "@/lib/mock/types";
import { loadProgress } from "@/lib/progress/overview";
import { PageBody } from "@/components/candidate/page-body";
import { PAGE_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { Accordion } from "@/components/candidate/accordion";
import { ChapterResults } from "@/components/candidate/chapter-results";
import { MockHistoryList } from "@/app/dashboard/mock/mock-history";

export const metadata: Metadata = { title: "My progress" };

// My progress: Handbook, Practice and mock tests in the current test type.
export default async function ProgressPage() {
  const session = await requireRole(["candidate"]);
  await settleOwnMocks(session.sub);
  const progress = await loadProgress(session.sub);
  if (!progress) redirect(SESSION_ENDED_LOGIN);
  const { handbook, practice, mock, readiness } = progress;
  const weak = practice.chapters.filter((chapter) => chapter.area === "weak");

  return (
    <PageBody>
      <div className="max-w-3xl">
        <h1 className={`${PAGE_TITLE}`}>My progress</h1>
        <p className="mt-2 text-base text-ink [overflow-wrap:anywhere]">Your Handbook, Practice and mock tests for {progress.testTypeName}.</p>

        <div className="mt-5 flex flex-col gap-4 lg:mt-6">
          <Accordion
            id="readiness"
            title="Readiness"
            summary={readiness ? `${readiness.score}% · ${readiness.label}` : "Take a mock test to see your readiness score."}
            share={readiness ? readiness.score / 100 : undefined}
          >
            {readiness ? (
              <>
                <h3 className="text-lg font-bold text-ink">How it’s worked out</h3>
                <ul className="mt-2 divide-y divide-ink/10">
                  {readiness.parts.map((part) => (
                    <li key={part.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-base text-ink">
                      <span>
                        {part.name} <span className="text-base text-muted">(counts for {Math.round(part.weight * 100)}%)</span>
                      </span>
                      <span className="font-bold">{part.percent}%</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-base text-muted">This is a guide to help you prepare, not a prediction of your official result.</p>
              </>
            ) : (
              <Link href="/dashboard/mock" className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
                Go to Mock test
              </Link>
            )}
          </Accordion>

          <Accordion
            id="handbook"
            title="Handbook"
            summary={
              handbook.total === 0
                ? `There’s no Handbook for ${progress.testTypeName} yet.`
                : `${donePercent(handbook.done, handbook.total)}% done · ${handbook.done} of ${handbook.total} pages and questions`
            }
            share={handbook.total > 0 ? handbook.done / handbook.total : undefined}
          >
            {handbook.total === 0 ? (
              <p className="text-base text-ink">Please check back soon.</p>
            ) : (
              <>
                <Link href="/dashboard/prepare" className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
                  {handbook.done === 0 ? "Start reading" : "Continue reading"}
                </Link>
                <ChapterResults
                  id="handbook-chapters"
                  title="By chapter"
                  level={3}
                  collapsible
                  noun="done"
                  items={handbook.chapters.map((chapter) => ({ key: chapter.id, label: chapter.label, right: chapter.done, outOf: chapter.total }))}
                />
              </>
            )}
          </Accordion>

          <Accordion
            id="practice"
            title="Practice"
            summary={
              practice.pool === 0
                ? `There are no practice questions for ${progress.testTypeName} yet.`
                : `${practice.practised} of ${countOf(practice.pool, "question")} practised${practice.tries > 0 ? ` · ${scorePercent(practice.right, practice.tries)}% right` : ""}`
            }
            share={practice.pool > 0 ? practice.practised / practice.pool : undefined}
          >
            {practice.pool === 0 ? (
              <p className="text-base text-ink">Please check back soon.</p>
            ) : (
              <>
                <p className="text-base text-ink">
                  {practice.tries > 0
                    ? `${practice.right} of ${practice.tries} answers right (${scorePercent(practice.right, practice.tries)}%).`
                    : "You haven’t practised any questions yet."}
                  {practice.flagged > 0 && ` ${countOf(practice.flagged, "question")} flagged for review.`}
                </p>
                {weak.length > 0 && (
                  <p className="mt-2 text-base text-ink">
                    Weak {weak.length === 1 ? "area" : "areas"}: {weak.map((chapter) => chapter.label).join(", ")}.
                  </p>
                )}
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  {weak.length > 0 && (
                    <Link href={`/dashboard/practice?${weak.map((chapter) => `chapter=${chapter.id}`).join("&")}`} className={PRIMARY_BUTTON}>
                      Practise weak {weak.length === 1 ? "chapter" : "chapters"}
                    </Link>
                  )}
                  <Link href="/dashboard/practice" className={weak.length > 0 ? SECONDARY_BUTTON : PRIMARY_BUTTON}>
                    Go to Practice
                  </Link>
                </div>
                <ChapterResults
                  id="practice-chapters"
                  title="By chapter"
                  level={3}
                  collapsible
                  showPercent
                  empty="Not practised yet"
                  items={practice.chapters.map((chapter) => ({
                    key: chapter.id,
                    label: chapter.label,
                    right: chapter.right,
                    outOf: chapter.tries,
                    badge: chapter.area === "weak" ? "Weak" : chapter.area === "strong" ? "Strong" : undefined,
                    badgeTone: chapter.area === "strong" ? "green" : "amber",
                  }))}
                />
              </>
            )}
          </Accordion>

          <Accordion
            id="mock-tests"
            title="Mock tests"
            summary={
              mock.count === 0
                ? "You haven’t taken a mock test yet."
                : `${countOf(mock.count, "test")} taken${mock.items[0] ? ` · last ${scoreText(mock.items[0].rightCount, mock.items[0].outOf)}` : ""}`
            }
            share={mock.items[0] && mock.items[0].outOf > 0 ? mock.items[0].rightCount / mock.items[0].outOf : undefined}
          >
            {mock.count === 0 ? (
              <Link href="/dashboard/mock" className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
                Go to Mock test
              </Link>
            ) : (
              <MockHistoryList
                history={mock}
                title="Recent mock tests"
                level={3}
                collapse="list"
                showAverage
                moreHref={`/dashboard/mock?shown=${MOCK_HISTORY_STEP}#history-heading`}
                moreLabel="See all your mock tests"
              />
            )}
          </Accordion>
        </div>

        <Link href="/dashboard" className={`${SECONDARY_BUTTON} mt-5 lg:mt-6 w-full sm:w-auto`}>
          Back to home
        </Link>

        <p className="mt-5 lg:mt-6 text-base text-muted">Designed to help you prepare with confidence.</p>
      </div>
    </PageBody>
  );
}
