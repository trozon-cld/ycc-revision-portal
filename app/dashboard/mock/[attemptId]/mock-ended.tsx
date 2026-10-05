import Link from "next/link";
import { formatDuration, countOf } from "@/lib/format";
import { READINESS_TARGET, type MockEnd, type MockSummary } from "@/lib/mock/types";
import { PageBody } from "@/components/candidate/page-body";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";

const ENDINGS: Record<MockEnd, { title: string; text: string }> = {
  submitted: { title: "Test submitted", text: "Your mock test has been submitted." },
  time_up: { title: "Time is up", text: "Time is up. Your test has been submitted automatically." },
  away: { title: "Time ran out", text: "Time ran out while you were away. Your test was submitted with the answers you’d saved." },
  moved: { title: "Test ended", text: "Your category was changed, so this test was ended with the answers you’d saved." },
};

// Shown once a mock test has ended: score, readiness and time (the full results come in E5b).
export function MockEnded({ summary }: { summary: MockSummary }) {
  const ending = ENDINGS[summary.how];
  const share = summary.outOf > 0 ? summary.rightCount / summary.outOf : 0;
  const ready = share >= READINESS_TARGET;
  const removed = summary.total - summary.outOf;
  return (
    <PageBody>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold text-ink">{ending.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink">{ending.text}</p>

        <section aria-labelledby="score-heading" className="mt-6 rounded-xl border-2 border-ink/15 bg-white p-5">
          <h2 id="score-heading" className="text-base font-semibold text-ink/80">
            Your score
          </h2>
          <p className="mt-1 text-4xl font-bold text-ink">
            {summary.rightCount} of {summary.outOf}{" "}
            <span className="ml-2 text-2xl font-semibold text-ink/80">{Math.round(share * 100)}%</span>
          </p>
          <p
            className={`mt-4 rounded-lg border-l-4 px-4 py-3 text-lg font-semibold ${
              ready ? "border-green-700 bg-green-50 text-green-900" : "border-primary bg-primary/5 text-ink"
            }`}
          >
            {ready
              ? `You reached the ${Math.round(READINESS_TARGET * 100)}% readiness target.`
              : `Not yet at the ${Math.round(READINESS_TARGET * 100)}% readiness target. Keep practising, and try another mock test when you’re ready.`}
          </p>
          <dl className="mt-4 grid gap-2 text-lg text-ink sm:grid-cols-2">
            <div>
              <dt className="inline font-semibold">Answered: </dt>
              <dd className="inline">
                {summary.answered} of {summary.outOf}
              </dd>
            </div>
            <div>
              <dt className="inline font-semibold">Time taken: </dt>
              <dd className="inline">{formatDuration(summary.secondsTaken)}</dd>
            </div>
          </dl>
          {removed > 0 && (
            <p className="mt-3 text-base text-ink/80">
              {countOf(removed, "question was", "questions were")} removed during the test, so {removed === 1 ? "it doesn’t" : "they don’t"} count.
            </p>
          )}
        </section>

        <p className="mt-4 text-base text-ink/80">Mock test results are for practice and aren’t an official CITB result.</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard" className={PRIMARY_BUTTON}>
            Back to home
          </Link>
          <Link href="/dashboard/mock" className={SECONDARY_BUTTON}>
            Take another mock test
          </Link>
        </div>
      </div>
    </PageBody>
  );
}
