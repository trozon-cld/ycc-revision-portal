import type { ResolvedMedia } from "@/lib/content/book";
import type { MockReviewItem } from "@/lib/mock/types";
import { InlineText } from "@/components/learning/inline-text";
import { MarkIcon } from "@/components/learning/questions/answer-parts";
import { ReviewQuestion } from "@/components/learning/questions/review-question";
import { FlagButton } from "@/app/dashboard/practice/flag-button";

const MARKS = {
  R: { text: "Right", tone: "border-green-700 bg-green-50 text-green-900", icon: "tick" },
  W: { text: "Wrong", tone: "border-amber-600 bg-amber-50 text-amber-950", icon: "cross" },
  U: { text: "Not answered", tone: "border-ink/30 bg-ink/5 text-ink", icon: null },
} as const;

// One row per question; opening it shows the question with both answers and the explanation.
export function ReviewList({ attemptId, total, items, media }: { attemptId: string; total: number; items: MockReviewItem[]; media: ResolvedMedia }) {
  return (
    <ul className="mt-6 flex flex-col gap-3">
      {items.map((item) => {
        const mark = MARKS[item.mark];
        return (
          <li key={item.position}>
            <details className="group rounded-xl border-2 border-ink/15 bg-white open:border-primary/40">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-base text-ink/80">
                    <span className="font-semibold text-ink">
                      Question {item.position + 1} of {total}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full border-2 px-2 text-sm font-semibold ${mark.tone}`}>
                      {mark.icon && <MarkIcon name={mark.icon} className="size-4" />}
                      {mark.text}
                    </span>
                    {item.flaggedInTest && <span className="rounded-full border-2 border-amber-600 px-2 text-sm font-semibold text-amber-950">Flagged</span>}
                  </span>
                  <span className="mt-1 block text-base text-ink/80 [overflow-wrap:anywhere]">{item.chapterLabel}</span>
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
                <ReviewQuestion
                  question={item.question}
                  seed={`${attemptId}:${item.question.id}`}
                  label={`Question ${item.position + 1}`}
                  media={media}
                  answer={item.answer}
                  explanation={item.explanation}
                  response={item.response}
                  result={{ answered: item.mark !== "U", correct: item.mark === "R" }}
                />
                {item.practiceFlag !== null && <FlagButton questionId={item.question.id} initialFlagged={item.practiceFlag} className="mt-5" />}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
