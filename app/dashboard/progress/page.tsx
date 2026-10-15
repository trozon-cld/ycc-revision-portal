import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { SESSION_ENDED_LOGIN } from "@/lib/auth/constants";
import { countOf } from "@/lib/format";
import { settleOwnMocks } from "@/lib/mock/attempts";
import { donePercent, scorePercent } from "@/lib/mock/types";
import { loadProgress } from "@/lib/progress/overview";
import { PageBody } from "@/components/candidate/page-body";
import { BAR_FILL, BAR_TRACK, CARD, PAGE_TITLE, PRIMARY_BUTTON, SECONDARY_BUTTON, SECTION_TITLE } from "@/components/candidate/buttons";
import { ChapterResults } from "@/components/candidate/chapter-results";
import { MockHistoryList } from "@/app/dashboard/mock/mock-history";

export const metadata: Metadata = { title: "My progress" };

// A thick bar for a section's overall figure (the share is also written out next to it).
function Bar({ share }: { share: number }) {
  return (
    <div aria-hidden="true" className={`${BAR_TRACK} mt-3 h-4`}>
      <div className={BAR_FILL} style={{ width: `${Math.min(100, share * 100)}%` }} />
    </div>
  );
}

// My progress: Handbook, Practice and mock tests in the current category.
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
        <p className="mt-2 text-base text-ink [overflow-wrap:anywhere]">Your Handbook, Practice and mock tests for {progress.categoryName}.</p>

        <section aria-labelledby="readiness-heading" className="mt-5 lg:mt-6 rounded-xl border-2 border-primary/40 bg-card p-4 lg:p-5">
          <h2 id="readiness-heading" className={`${SECTION_TITLE}`}>
            Readiness
          </h2>
          {readiness ? (
            <>
              <p className="mt-2 text-base text-ink">
                <span className="text-2xl lg:text-3xl font-bold">{readiness.score}%</span> · <span className="font-bold">{readiness.label}</span>
              </p>
              <Bar share={readiness.score / 100} />
              <h3 className="mt-5 text-xl font-bold text-ink">How it’s worked out</h3>
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
            <>
              <p className="mt-2 text-base text-ink">Take a mock test to see your readiness score.</p>
              <Link href="/dashboard/mock" className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
                Go to Mock test
              </Link>
            </>
          )}
        </section>

        <section aria-labelledby="handbook-heading" className={`mt-5 lg:mt-6 ${CARD} p-4 lg:p-5`}>
          <h2 id="handbook-heading" className={`${SECTION_TITLE}`}>
            Handbook
          </h2>
          {handbook.total === 0 ? (
            <p className="mt-2 text-base text-ink">There’s no Handbook for {progress.categoryName} yet. Please check back soon.</p>
          ) : (
            <>
              <p className="mt-2 text-base text-ink">
                <span className="text-2xl lg:text-3xl font-bold">{donePercent(handbook.done, handbook.total)}%</span> done ·{" "}
                {handbook.done} of {handbook.total} pages and questions
              </p>
              <Bar share={handbook.done / handbook.total} />
              <Link href="/dashboard/prepare" className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
                {handbook.done === 0 ? "Start reading" : "Continue reading"}
              </Link>
              <ChapterResults
                id="handbook-chapters"
                title="By chapter"
                level={3}
                noun="done"
                items={handbook.chapters.map((chapter) => ({ key: chapter.id, label: chapter.label, right: chapter.done, outOf: chapter.total }))}
              />
            </>
          )}
        </section>

        <section aria-labelledby="practice-heading" className={`mt-5 lg:mt-6 ${CARD} p-4 lg:p-5`}>
          <h2 id="practice-heading" className={`${SECTION_TITLE}`}>
            Practice
          </h2>
          {practice.pool === 0 ? (
            <p className="mt-2 text-base text-ink">There are no practice questions for {progress.categoryName} yet. Please check back soon.</p>
          ) : (
            <>
              <p className="mt-2 text-base text-ink">
                <span className="text-2xl lg:text-3xl font-bold">{practice.practised}</span> of {countOf(practice.pool, "question")} practised
              </p>
              <Bar share={practice.practised / practice.pool} />
              <p className="mt-3 text-base text-ink">
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
        </section>

        <section aria-labelledby="mock-heading" className={`mt-5 lg:mt-6 ${CARD} p-4 lg:p-5`}>
          <h2 id="mock-heading" className={`${SECTION_TITLE}`}>
            Mock tests
          </h2>
          {mock.count === 0 ? (
            <>
              <p className="mt-2 text-base text-ink">You haven’t taken a mock test yet.</p>
              <Link href="/dashboard/mock" className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
                Go to Mock test
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-base text-ink">{countOf(mock.count, "mock test")} taken.</p>
              <MockHistoryList
                history={mock}
                title="Recent mock tests"
                level={3}
                showAverage
                moreHref="/dashboard/mock#history-heading"
                moreLabel="See all your mock tests"
              />
            </>
          )}
        </section>

        <Link href="/dashboard" className={`${SECONDARY_BUTTON} mt-5 lg:mt-6 w-full sm:w-auto`}>
          Back to home
        </Link>

        <p className="mt-5 lg:mt-6 text-base text-muted">Designed to help you prepare with confidence.</p>
      </div>
    </PageBody>
  );
}
