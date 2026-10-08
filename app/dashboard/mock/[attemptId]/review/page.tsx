import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { loadMockReview } from "@/lib/mock/attempts";
import { MOCK_KEEP_ANSWERS, type MockReviewItem } from "@/lib/mock/types";
import { isUuid } from "@/lib/ids";
import { firstParam } from "@/lib/params";
import { PageBody } from "@/components/candidate/page-body";
import { SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { FocusedShell } from "@/components/learning/focused-shell";
import { ReviewList } from "./review-list";

const FILTERS: { key: string; label: string; match: (item: MockReviewItem) => boolean; none: string }[] = [
  { key: "wrong", label: "Wrong", match: (item) => item.mark === "W", none: "No wrong answers in this test." },
  { key: "unanswered", label: "Not answered", match: (item) => item.mark === "U", none: "You answered every question." },
  { key: "flagged", label: "Flagged", match: (item) => item.flaggedInTest, none: "You didn’t flag any questions in this test." },
  { key: "all", label: "All", match: () => true, none: "There are no questions to show." },
];

// An ended mock test, question by question: the candidate's answer, the correct one and the explanation.
export default async function MockReviewPage({ params, searchParams }: PageProps<"/dashboard/mock/[attemptId]/review">) {
  const session = await requireRole(["candidate"]);
  const { attemptId } = await params;
  if (!isUuid(attemptId)) redirect("/dashboard/mock");
  const review = await loadMockReview(session.sub, attemptId);
  // Still running, someone else's or gone: the test's own page decides what to show.
  if (!review) redirect(`/dashboard/mock/${attemptId}`);

  const counts = new Map(FILTERS.map((filter) => [filter.key, review.items.filter(filter.match).length]));
  const asked = firstParam((await searchParams).show);
  // Without a choice: wrong answers first, then unanswered, then all.
  const filter =
    FILTERS.find((item) => item.key === asked) ?? FILTERS.find((item) => item.key !== "flagged" && (counts.get(item.key) ?? 0) > 0) ?? FILTERS[3];
  const items = review.items.filter(filter.match);
  const resultsHref = `/dashboard/mock/${attemptId}`;

  return (
    <FocusedShell label="Mock test tools" status="Your answers">
      <PageBody>
        <div className="max-w-3xl">
          <h1 className="text-3xl font-bold text-ink">Your answers</h1>
          {!review.kept ? (
            <p className="mt-4 text-lg leading-relaxed text-ink">
              Answers are kept for your {MOCK_KEEP_ANSWERS} newest mock tests, so this test’s answers are no longer available. Its score and
              results by topic are still on its results page.
            </p>
          ) : (
            <>
              <p className="mt-2 text-lg text-ink">See your answer, the correct answer and why, for each question.</p>
              <nav aria-label="Show questions" className="mt-5 flex flex-wrap gap-2">
                {FILTERS.map((item) => {
                  const current = item.key === filter.key;
                  return (
                    <Link
                      key={item.key}
                      href={`/dashboard/mock/${attemptId}/review?show=${item.key}`}
                      aria-current={current ? "page" : undefined}
                      className={`inline-flex min-h-12 items-center rounded-full border-2 px-4 text-lg font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        current ? "border-primary bg-primary text-white" : "border-ink/25 bg-white text-ink hover:border-primary hover:text-primary"
                      }`}
                    >
                      {item.label} ({counts.get(item.key)})
                    </Link>
                  );
                })}
              </nav>
              {review.items.some((item) => item.practiceFlag !== null) && (
                <p className="mt-4 text-base text-ink/80">Flag a question to practise it later: Practice → Flagged questions.</p>
              )}
              {items.length === 0 ? (
                <p className="mt-6 text-lg text-ink">{filter.none}</p>
              ) : (
                <ReviewList attemptId={attemptId} total={review.total} items={items} media={review.media} />
              )}
            </>
          )}
          <Link href={resultsHref} className={`${SECONDARY_BUTTON} mt-8 w-full sm:w-auto`}>
            Back to your results
          </Link>
        </div>
      </PageBody>
    </FocusedShell>
  );
}
