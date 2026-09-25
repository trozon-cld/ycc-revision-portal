"use client";

import { useId, useState, type ReactNode } from "react";
import type { ResolvedMedia } from "@/lib/content/book";
import { checkAnswer } from "@/lib/questions/check";
import type { ClientQuestion } from "@/lib/questions/public";
import type { CheckResult } from "@/lib/questions/types";
import { InlineText } from "../inline-text";
import { BookPicture } from "../picture";
import { QUESTION_RENDERERS } from "./renderers";

type Phase = "answering" | "checked" | "revealed";

// The shared frame for every question type, in learn, practice and exam modes. Candidate style:
// sizes in em so A−/A+ scales it; buttons never under 56px. The question and its answers never
// split across book pages; the explanation may continue on the next page.
export function QuestionView({
  question,
  label,
  media,
  initialResponse = null,
  seed,
  onCheck,
  onResponseChange,
}: {
  question: ClientQuestion;
  // e.g. "Question 3" in the book, "3 of 36" in a mock test.
  label: string;
  media: ResolvedMedia;
  initialResponse?: unknown;
  // Shuffle seed for Practice and Mock; defaults to the question id.
  seed?: string;
  // Practice: marks on the server. Learn marks in the browser with the answer it already has.
  onCheck?: (response: unknown) => Promise<CheckResult | null>;
  // Exam: reports every change; nothing is marked here.
  onResponseChange?: (response: unknown) => void;
}) {
  const [response, setResponse] = useState<unknown>(initialResponse);
  const [phase, setPhase] = useState<Phase>("answering");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const stemId = useId();

  const { mode } = question;
  const AnswerArea = QUESTION_RENDERERS[question.type];
  const hasResponse = response !== null && response !== undefined;

  function changeResponse(next: unknown) {
    if (phase !== "answering") return;
    setResponse(next);
    setNotice(null);
    onResponseChange?.(next);
  }

  async function check() {
    if (!hasResponse) {
      setNotice("Choose an answer first.");
      return;
    }
    setChecking(true);
    try {
      const marked =
        mode === "learn"
          ? checkAnswer({ type: question.type, content: question.content, answer: question.answer }, response)
          : await onCheck?.(response);
      if (!marked) {
        setNotice("This answer couldn't be checked. Please try again.");
        return;
      }
      setResult(marked);
      setPhase("checked");
    } finally {
      setChecking(false);
    }
  }

  function reset() {
    setResponse(null);
    setResult(null);
    setNotice(null);
    setPhase("answering");
  }

  const canCheck = mode === "learn" || (mode === "practice" && Boolean(onCheck));
  const showExplanation = mode === "learn" && phase !== "answering" && Boolean(question.explanation);

  return (
    <section aria-labelledby={stemId} className="question-view">
      <fieldset className="m-0 min-w-0 border-0 p-0 [break-inside:avoid]">
        <legend id={stemId} className="mb-[0.8em] w-full p-0">
          <span className="mb-[0.3em] block text-[0.8em] font-bold uppercase tracking-wide text-primary">{label}</span>
          <span className="block whitespace-pre-line text-[1.1em] font-medium leading-snug text-ink">
            <InlineText text={question.stemText} />
          </span>
        </legend>

        {question.stemMediaId && <BookPicture picture={media[question.stemMediaId]} />}

        <div className="mb-[0.9em]">
          {AnswerArea ? (
            <AnswerArea
              questionId={question.id}
              mode={mode}
              seed={seed ?? question.id}
              content={question.content}
              answer={mode === "learn" ? question.answer : undefined}
              response={response}
              onResponse={changeResponse}
              locked={phase !== "answering"}
              showCorrect={mode === "learn" && phase !== "answering"}
              result={result}
            />
          ) : (
            <p className="rounded-lg bg-slate-100 px-[0.9em] py-[0.7em] text-slate-700">This question can&apos;t be shown yet.</p>
          )}
        </div>
      </fieldset>

      {canCheck && AnswerArea && (
        <div className="mb-[0.9em] flex flex-wrap gap-[0.6em] [break-inside:avoid]">
          {phase === "answering" ? (
            <>
              <FrameButton key="check" primary onClick={check} disabled={checking}>
                {checking ? "Checking…" : "Check answer"}
              </FrameButton>
              {mode === "learn" && <FrameButton key="reveal" onClick={() => setPhase("revealed")}>Reveal answer</FrameButton>}
            </>
          ) : (
            <FrameButton key="again" onClick={reset}>
              Try again
            </FrameButton>
          )}
        </div>
      )}

      <div role="status" aria-live="polite" className="[break-inside:avoid]">
        {notice && <p className="mb-[0.9em] font-semibold text-ink">{notice}</p>}
        {phase === "checked" && result && <Feedback correct={result.correct} showsAnswer={mode === "learn"} />}
        {phase === "revealed" && (
          <p className="mb-[0.9em] rounded-lg border-l-[0.3em] border-primary bg-primary/[0.07] px-[0.9em] py-[0.6em] font-semibold text-ink">
            The correct answer is highlighted.
          </p>
        )}
      </div>

      {showExplanation && (
        <div className="mb-[0.9em]">
          <p className="mb-[0.2em] text-[0.8em] font-bold uppercase tracking-wide text-primary [break-after:avoid]">Explanation</p>
          <p className="whitespace-pre-line [orphans:2] [widows:2]">
            <InlineText text={question.explanation ?? ""} />
          </p>
        </div>
      )}
    </section>
  );
}

function Feedback({ correct, showsAnswer }: { correct: boolean; showsAnswer: boolean }) {
  return (
    <p
      className={`mb-[0.9em] flex items-start gap-[0.5em] rounded-lg border-l-[0.3em] px-[0.9em] py-[0.6em] font-semibold ${
        correct ? "border-green-700 bg-green-50 text-green-900" : "border-amber-600 bg-amber-50 text-amber-950"
      }`}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-[0.15em] size-[1.1em] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
        {correct ? <path d="M4 10.5l4 4 8-9" /> : <path d="M5 5l10 10M15 5L5 15" />}
      </svg>
      <span>
        {correct ? "Correct." : "Not quite."}
        {!correct && showsAnswer && <span className="font-normal"> The correct answer is highlighted.</span>}
      </span>
    </p>
  );
}

function FrameButton({
  primary = false,
  disabled = false,
  onClick,
  children,
}: {
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[max(56px,3.5em)] items-center justify-center rounded-lg px-[1.25em] font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 ${
        primary ? "bg-primary text-white hover:bg-primary/90" : "border-2 border-primary bg-white text-primary hover:bg-primary/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}
