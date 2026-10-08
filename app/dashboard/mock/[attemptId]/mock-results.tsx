import Link from "next/link";
import { countOf, formatDuration } from "@/lib/format";
import { MOCK_KEEP_ANSWERS, READINESS_TARGET, scorePercent, type MockEnd, type MockResults } from "@/lib/mock/types";
import { PageBody } from "@/components/candidate/page-body";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { ChapterResults } from "@/components/candidate/chapter-results";
import { practiseMockMisses } from "@/app/dashboard/practice/actions";
import { RetryButton } from "@/app/dashboard/practice/[sessionId]/retry-button";

const ENDINGS: Record<MockEnd, { title: string; text: string }> = {
  submitted: { title: "Test submitted", text: "Your mock test has been submitted." },
  time_up: { title: "Time is up", text: "Time is up. Your test has been submitted automatically." },
  away: { title: "Time ran out", text: "Time ran out while you were away. Your test was submitted with the answers you’d saved." },
  moved: { title: "Test ended", text: "Your category was changed, so this test was ended with the answers you’d saved." },
};

// A mock test's results: score, readiness, counts, time, the recommended next step and results by topic.
export function MockResultsView({ attemptId, results, practiceUnavailable }: { attemptId: string; results: MockResults; practiceUnavailable: boolean }) {
  const ending = ENDINGS[results.how];
  const share = results.outOf > 0 ? results.rightCount / results.outOf : 0;
  const target = Math.round(READINESS_TARGET * 100);
  const ready = share >= READINESS_TARGET;
  const wrong = results.answered - results.rightCount;
  const unanswered = results.outOf - results.answered;
  const removed = results.total - results.outOf;
  const weakIds = new Set(results.weakest.map((topic) => topic.id));
  const { next } = results;

  return (
    <PageBody>
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold text-ink">{ending.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink">{ending.text}</p>

        <section aria-labelledby="score-heading" className="mt-6 rounded-xl border-2 border-ink/15 bg-white p-5">
          <h2 id="score-heading" className="text-base font-semibold text-ink/80">
            Your score
          </h2>
          <p className="mt-1 text-4xl font-bold text-ink">
            {results.rightCount} of {results.outOf}{" "}
            <span className="ml-2 text-2xl font-semibold text-ink/80">{scorePercent(results.rightCount, results.outOf)}%</span>
          </p>
          <p
            className={`mt-4 rounded-lg border-l-4 px-4 py-3 text-lg font-semibold ${
              ready ? "border-green-700 bg-green-50 text-green-900" : "border-primary bg-primary/5 text-ink"
            }`}
          >
            {ready ? `You reached the ${target}% readiness target.` : `Not yet at the ${target}% readiness target.`}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["Correct", results.rightCount],
              ["Incorrect", wrong],
              ["Not answered", unanswered],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-ink/5 px-2 py-3">
                <dt className="text-base text-ink/80">{label}</dt>
                <dd className="text-2xl font-bold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-lg text-ink">
            <span className="font-semibold">Time taken:</span> {formatDuration(results.secondsTaken)}
          </p>
          {removed > 0 && (
            <p className="mt-3 text-base text-ink/80">
              {countOf(removed, "question was", "questions were")} removed during the test, so {removed === 1 ? "it doesn’t" : "they don’t"} count.
            </p>
          )}
        </section>

        {practiceUnavailable && (
          <p role="alert" className="mt-4 rounded-xl border-2 border-red-700 bg-red-50 p-4 text-lg font-semibold text-red-800">
            These questions can’t be practised right now. Try a new practice instead.
          </p>
        )}
        {results.answersKept ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link href={`/dashboard/mock/${attemptId}/review`} className={`${SECONDARY_BUTTON} w-full sm:w-auto`}>
              Review your answers
            </Link>
            {results.practiceCount > 0 && (
              <form action={practiseMockMisses} className="sm:w-auto">
                <input type="hidden" name="attemptId" value={attemptId} />
                <RetryButton
                  count={results.practiceCount}
                  secondary
                  label={`Practise the ${countOf(results.practiceCount, "question")} you missed`}
                />
              </form>
            )}
          </div>
        ) : (
          <p className="mt-4 text-base text-ink/80">Answers are kept for your {MOCK_KEEP_ANSWERS} newest mock tests, so this one can’t be reviewed question by question.</p>
        )}

        <section aria-labelledby="next-heading" className="mt-6 rounded-xl border-2 border-primary bg-primary/5 p-5">
          <h2 id="next-heading" className="text-xl font-bold text-ink">
            Recommended next step
          </h2>
          {next.kind === "chapters" ? (
            <>
              <p className="mt-2 text-lg text-ink">Practise your weakest {results.weakest.length === 1 ? "topic" : "topics"}:</p>
              <ul className="mt-2 flex flex-col gap-1 text-lg text-ink">
                {results.weakest.map((topic) => (
                  <li key={topic.id} className="[overflow-wrap:anywhere]">
                    <span className="font-semibold">{topic.label}</span> ({topic.right} of {topic.outOf} right)
                  </li>
                ))}
              </ul>
              <Link
                href={`/dashboard/practice?${next.chapterIds.map((id) => `chapter=${id}`).join("&")}`}
                className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}
              >
                Practise {results.weakest.length === 1 ? "this chapter" : "these chapters"}
              </Link>
            </>
          ) : next.kind === "smart" ? (
            <>
              <p className="mt-2 text-lg text-ink">Keep practising with Smart practice, then try another mock test.</p>
              <Link href="/dashboard/practice" className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
                Go to Practice
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg text-ink">
                {ready ? "Well done. Try another mock test to check you can do it again." : "Try another mock test when you’re ready."}
              </p>
              <Link href="/dashboard/mock" className={`${PRIMARY_BUTTON} mt-4 w-full sm:w-auto`}>
                Take another mock test
              </Link>
            </>
          )}
        </section>

        {results.topics.length > 0 && (
          <ChapterResults
            id="topics-heading"
            title="Results by topic"
            showPercent
            items={results.topics.map((topic) => ({ key: topic.id, label: topic.label, right: topic.right, outOf: topic.outOf, badge: weakIds.has(topic.id) ? "Weakest" : undefined }))}
          />
        )}

        <p className="mt-8 text-base text-ink/80">Mock test results are for practice and aren’t an official CITB result.</p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard" className={SECONDARY_BUTTON}>
            Back to home
          </Link>
          {next.kind !== "mock" && (
            <Link href="/dashboard/mock" className={SECONDARY_BUTTON}>
              Take another mock test
            </Link>
          )}
        </div>
      </div>
    </PageBody>
  );
}
