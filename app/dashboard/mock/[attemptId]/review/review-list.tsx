import type { ResolvedMedia } from "@/lib/content/book";
import { BADGE, CARD } from "@/components/candidate/buttons";
import type { MockReviewItem } from "@/lib/mock/types";
import { InlineText } from "@/components/learning/inline-text";
import { MarkIcon } from "@/components/learning/questions/answer-parts";
import { ReviewQuestion } from "@/components/learning/questions/review-question";
import { FlagButton } from "@/app/dashboard/practice/flag-button";

const MARKS = {
  R: { text: "Right", tone: "border-ok bg-ok-bg text-ok-strong", icon: "tick" },
  W: { text: "Wrong", tone: "border-warn bg-warn-bg text-warn-strong", icon: "cross" },
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
            <details className={`group ${CARD} open:border-primary/40`}>
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-base text-muted">
                    <span className="font-semibold text-ink">
                      Question {item.position + 1} of {total}
                    </span>
                    <span className={`${BADGE} ${mark.tone}`}>
                      {mark.icon && <MarkIcon name={mark.icon} className="size-4" />}
                      {mark.text}
                    </span>
                    {item.flaggedInTest && <span className={`${BADGE} border-warn bg-warn-bg text-warn-strong`}>Flagged</span>}
                  </span>
                  <span className="mt-1 block text-base text-muted [overflow-wrap:anywhere]">{item.chapterLabel}</span>
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
