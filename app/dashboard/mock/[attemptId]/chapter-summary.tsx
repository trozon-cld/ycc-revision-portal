import Link from "next/link";
import type { MockChapterResult, MockMark, MockResults } from "@/lib/mock/types";
import { Accordion } from "@/components/candidate/accordion";
import { BADGE, BAR_FILL, BAR_TRACK, CARD, SECONDARY_BUTTON, SECTION_TITLE } from "@/components/candidate/buttons";
import { Icon } from "@/components/icons";

const MARK_WORDS: Record<MockMark, string> = { R: "Right", W: "Wrong", U: "Not answered" };
const percent = (right: number, outOf: number) => (outOf > 0 ? Math.round((right / outOf) * 100) : 0);

// A mock test's results by chapter, grouped by section; each chapter opens to its questions in this test.
export function ChapterSummary({ attemptId, results }: { attemptId: string; results: MockResults }) {
  const weakIds = new Set(results.weakest.map((topic) => topic.id));
  return (
    <section aria-labelledby="chapters-heading" className={`mt-5 lg:mt-6 ${CARD} p-4 lg:p-5`}>
      <h2 id="chapters-heading" className={SECTION_TITLE}>
        Results by chapter
      </h2>
      <p className="mt-1 text-base text-muted">Each chapter had only a few questions in this test, so use this as a guide.</p>
      {results.sections.map((section) => (
        <div key={section.key} className="mt-5">
          <h3 className="flex flex-wrap items-baseline justify-between gap-x-4 border-b-2 border-line pb-2 text-lg font-bold text-ink">
            <span className="[overflow-wrap:anywhere]">{section.label}</span>
            <span className="text-base font-semibold">
              {section.right} of {section.outOf} right ({percent(section.right, section.outOf)}%)
            </span>
          </h3>
          {section.chapters.map((chapter) => (
            <ChapterRow
              key={chapter.id}
              chapter={chapter}
              weakest={weakIds.has(chapter.id)}
              reviewHref={`/dashboard/mock/${attemptId}/review?chapter=${chapter.id}`}
              practiseHref={results.sameTestType && section.key !== "gone" ? `/dashboard/practice?chapter=${chapter.id}` : null}
            />
          ))}
        </div>
      ))}
      {results.notInTest.length > 0 && (
        <p className="mt-5 text-base text-muted [overflow-wrap:anywhere]">
          <span className="font-semibold text-ink">Not in this test:</span> {results.notInTest.join(", ")}
        </p>
      )}
    </section>
  );
}

function ChapterRow({ chapter, weakest, reviewHref, practiseHref }: { chapter: MockChapterResult; weakest: boolean; reviewHref: string; practiseHref: string | null }) {
  const summary = (
    <>
      {chapter.right} of {chapter.outOf} right ({percent(chapter.right, chapter.outOf)}%)
      {chapter.unanswered ? ` · ${chapter.unanswered} not answered` : ""}
      {weakest && <span className={`${BADGE} ml-2 border-warn bg-warn-bg align-middle text-warn-strong`}>Weakest</span>}
    </>
  );
  const share = chapter.outOf > 0 ? chapter.right / chapter.outOf : 0;
  // Older tests keep no answers: the chapter's line without its questions.
  if (!chapter.questions) {
    return (
      <div className="border-t-2 border-line-soft py-3 first:border-t-0">
        <p className="text-lg font-bold text-ink [overflow-wrap:anywhere]">{chapter.label}</p>
        <p className="mt-1 text-base text-muted">{summary}</p>
        <div aria-hidden="true" className={`${BAR_TRACK} mt-3 h-3.5`}>
          <div className={BAR_FILL} style={{ width: `${share * 100}%` }} />
        </div>
      </div>
    );
  }
  return (
    <Accordion id={`chapter-${chapter.id}`} title={chapter.label} summary={summary} share={share} nested>
      <ul className="flex flex-col gap-1">
        {chapter.questions.map((question) => (
          <li key={question.position} className="flex items-center gap-2 text-base text-ink">
            <Icon name={question.mark === "R" ? "tick" : "cross"} size={20} className={question.mark === "R" ? "text-ok-strong" : "text-muted"} />
            Question {question.position + 1}: <span className="font-semibold">{MARK_WORDS[question.mark]}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <Link href={reviewHref} className={`${SECONDARY_BUTTON} w-full sm:w-auto`}>
          {chapter.questions.length === 1 ? "See this answer" : "See these answers"}
        </Link>
        {practiseHref && (
          <Link href={practiseHref} className={`${SECONDARY_BUTTON} w-full sm:w-auto`}>
            Practise this chapter
          </Link>
        )}
      </div>
    </Accordion>
  );
}
