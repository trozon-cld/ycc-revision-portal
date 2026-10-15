"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ResolvedMedia } from "@/lib/content/book";
import { checkAnswer } from "@/lib/questions/check";
import { getQuestionTypeDef } from "@/lib/questions/registry";
import type { ClientQuestion } from "@/lib/questions/public";
import type { CheckResult } from "@/lib/questions/types";
import { NOT_THROUGH_MESSAGE } from "@/lib/forms";
import { InlineText } from "../inline-text";
import { MarkIcon } from "./answer-parts";
import { BookPicture } from "../picture";
import { QUESTION_RENDERERS } from "./renderers";

export type QuestionViewState = {
  response: unknown;
  phase: "answering" | "checked" | "revealed";
  result: CheckResult | null;
  notice: string | null;
  // A choice in progress that isn't an answer yet (e.g. the picture picked up in "Match pictures").
  // Kept here so every copy of the question in the book shares it.
  selection?: string | null;
  // Practice: the answer and explanation the server sends back after Check.
  shown?: { answer: unknown; explanation: string | null };
};

// Practice marking may also send the correct answer and the explanation to show.
export type CheckReply = CheckResult & { answer?: unknown; explanation?: string | null };

export const FRESH_QUESTION_STATE: QuestionViewState = { response: null, phase: "answering", result: null, notice: null };

// The shared frame for every question type, in learn, practice and exam modes. Sizes in em so A−/A+
// scales it; buttons never under 56px (48px in laptop spreads). Too long for a page: it continues.
export function QuestionView({
  question,
  label,
  media,
  initialResponse = null,
  initialState,
  seed,
  onCheck,
  onResponseChange,
  state: controlledState,
  onStateChange,
  retry = true,
  review = false,
  panel,
}: {
  question: ClientQuestion;
  // e.g. "Question 3" in the book, "3 of 36" in a mock test.
  label: string;
  media: ResolvedMedia;
  initialResponse?: unknown;
  // Starts in this state instead (e.g. Practice reopened on a question already checked).
  initialState?: QuestionViewState;
  // Shuffle seed for Practice and Mock; defaults to the question id.
  seed?: string;
  // Practice: marks on the server. Learn marks in the browser with the answer it already has.
  // null: couldn't be checked (a notice asks to try again); false: the caller has already dealt with it.
  onCheck?: (response: unknown) => Promise<CheckReply | null | false>;
  // Exam: reports every change; nothing is marked here.
  onResponseChange?: (response: unknown) => void;
  // Optional: the host keeps the state, so several copies of one question stay in step (the book).
  state?: QuestionViewState;
  onStateChange?: (state: QuestionViewState) => void;
  // "Try again" after Check; Practice turns it off (every question counts once).
  retry?: boolean;
  // Reports: the question text is already in the line above, so it's kept for screen readers only.
  review?: boolean;
  // Practice: below laptop width the result shows in a panel along the bottom, with these controls (e.g. Next question).
  panel?: ReactNode;
}) {
  const [ownState, setOwnState] = useState<QuestionViewState>(initialState ?? { ...FRESH_QUESTION_STATE, response: initialResponse });
  const [checking, setChecking] = useState(false);
  const current = controlledState ?? ownState;
  const { response, phase, result, notice, shown } = current;
  const setState = (patch: Partial<QuestionViewState>) => {
    const next = { ...current, ...patch };
    if (onStateChange) onStateChange(next);
    if (!controlledState) setOwnState(next);
  };
  const stemId = useId();
  // After Check or Reveal here, focus moves to the result: the button pressed has gone.
  const resultRef = useRef<HTMLDivElement>(null);
  const focusResult = useRef(false);
  useEffect(() => {
    if (!focusResult.current || phase === "answering") return;
    focusResult.current = false;
    resultRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const { mode } = question;
  const AnswerArea = QUESTION_RENDERERS[question.type];
  const hasResponse = response !== null && response !== undefined;
  const canCheck = mode === "learn" || (mode === "practice" && Boolean(onCheck));

  function changeResponse(next: unknown) {
    if (phase !== "answering") return;
    setState({ response: next, notice: null, selection: null });
    onResponseChange?.(next);
  }

  async function check() {
    if (!hasResponse) {
      setState({ notice: "Choose an answer first." });
      return;
    }
    const unfinished = getQuestionTypeDef(question.type)?.incomplete?.(question.content, response);
    if (unfinished) {
      setState({ notice: unfinished });
      return;
    }
    setChecking(true);
    try {
      const marked: CheckReply | null | false | undefined =
        mode === "learn"
          ? checkAnswer({ type: question.type, content: question.content, answer: question.answer }, response)
          : await onCheck?.(response);
      if (marked === false) return;
      if (!marked) {
        setState({ notice: NOT_THROUGH_MESSAGE });
        return;
      }
      const reveal = mode === "practice" && marked.answer !== undefined ? { answer: marked.answer, explanation: marked.explanation ?? null } : undefined;
      focusResult.current = true;
      setState({ result: { answered: marked.answered, correct: marked.correct }, phase: "checked", notice: null, shown: reveal });
    } catch {
      setState({ notice: NOT_THROUGH_MESSAGE });
    } finally {
      setChecking(false);
    }
  }

  function reset() {
    setState(FRESH_QUESTION_STATE);
  }

  const showsAnswer = (mode === "learn" && phase !== "answering") || Boolean(shown);
  const explanation = mode === "learn" ? question.explanation : shown?.explanation;
  const showExplanation = showsAnswer && Boolean(explanation);

  return (
    <section aria-labelledby={stemId} className="question-view">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend id={stemId} data-flow-unit className={review ? "sr-only" : "mb-[calc(0.8em*var(--q-space,1))] w-full p-0 [break-after:avoid] [break-inside:avoid]"}>
          <span className="mb-[0.3em] block text-[max(14px,0.8em)] font-bold uppercase tracking-wide text-primary">{label}</span>
          <span className="block whitespace-pre-line text-[1.25em] font-semibold leading-snug text-ink">
            <InlineText text={question.stemText} />
          </span>
        </legend>

        {question.stemMediaId && (
          <div data-flow-unit data-question-picture>
            <BookPicture
              picture={media[question.stemMediaId]}
              size={question.stemMediaSize ?? "full"}
              align={question.stemMediaAlign ?? "center"}
            />
          </div>
        )}

        {/* Spacing sits above each part, never below, so an empty feedback area can't start a new page. */}
        <div>
          {AnswerArea ? (
            <AnswerArea
              questionId={question.id}
              mode={mode}
              seed={seed ?? question.id}
              content={question.content}
              media={media}
              answer={mode === "learn" ? question.answer : shown?.answer}
              response={response}
              onResponse={changeResponse}
              onNotice={(message) => setState({ notice: message })}
              selection={current.selection ?? null}
              onSelection={(selection) => setState({ selection, notice: null })}
              onSubmit={canCheck && phase === "answering" && !checking ? check : undefined}
              locked={phase !== "answering"}
              showCorrect={showsAnswer}
              result={result}
              review={review}
            />
          ) : (
            <p className="rounded-lg bg-fill px-[0.9em] py-[0.7em] text-ink">This question can’t be shown yet.</p>
          )}
        </div>
      </fieldset>

      {canCheck && AnswerArea && phase === "answering" && (
        <div data-flow-unit className="mt-[calc(0.9em*var(--q-space,1))] flex flex-wrap gap-[0.6em] [break-inside:avoid]">
          <FrameButton key="check" primary fresh={mode !== "learn"} onClick={check} disabled={checking}>
            {checking ? "Checking…" : "Check answer"}
          </FrameButton>
          {mode === "learn" && <FrameButton
              key="reveal"
              onClick={() => {
                focusResult.current = true;
                setState({ phase: "revealed", notice: null });
              }}
            >Reveal answer</FrameButton>}
        </div>
      )}

      {/* After Check or Reveal, the message and "Try again" share one row, so the question stays compact. */}
      <div
        data-flow-unit
        data-feedback-panel={panel && phase !== "answering" ? "" : undefined}
        className={
          phase === "answering"
            ? "[break-inside:avoid]"
            : panel
              ? `mt-[calc(0.9em*var(--q-space,1))] [break-inside:avoid] ${PANEL}`
              : "mt-[calc(0.9em*var(--q-space,1))] flex flex-wrap items-center gap-[0.6em] [break-inside:avoid]"
        }
      >
        <div className={panel && phase !== "answering" ? "mx-auto w-full max-w-3xl" : "min-w-0 flex-1 basis-[12em]"}>
          <div role="status" aria-live="polite">
            {notice && <p className="mt-[calc(0.9em*var(--q-space,1))] font-semibold text-ink">{notice}</p>}
          </div>
          {phase !== "answering" && (
            <div ref={resultRef} tabIndex={-1} className="focus:outline-none">
              {phase === "checked" && result && <Feedback result={result} showsAnswer={showsAnswer} fresh={mode !== "learn"} />}
              {phase === "revealed" && (
                <p className="rounded-lg border-l-[0.3em] border-primary bg-primary/[0.07] px-[0.9em] py-[0.6em] font-semibold text-ink">
                  The correct answer is highlighted.
                </p>
              )}
            </div>
          )}
          {panel && phase !== "answering" && <div className="mt-4 lg:hidden">{panel}</div>}
        </div>
        {canCheck && retry && AnswerArea && phase !== "answering" && (
          <FrameButton key="again" onClick={reset}>
            Try again
          </FrameButton>
        )}
      </div>

      {showExplanation && (
        <div data-flow-unit data-question-explanation className="mt-[calc(0.9em*var(--q-space,1))]">
          <p className="mb-[0.2em] text-[max(14px,0.8em)] font-bold uppercase tracking-wide text-primary [break-after:avoid]">Explanation</p>
          <p className="whitespace-pre-line [orphans:2] [widows:2]">
            <InlineText text={explanation ?? ""} />
          </p>
        </div>
      )}
    </section>
  );
}

// Below laptop width: fixed along the bottom of the screen (slides up unless motion is reduced); from 1024px in the card.
const PANEL =
  "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-10 max-lg:mt-0 max-lg:border-t-2 max-lg:border-line max-lg:bg-card max-lg:px-4 max-lg:pt-4 max-lg:pb-[calc(1rem+env(safe-area-inset-bottom))] max-lg:shadow-[0_-4px_16px_rgb(30_41_59/0.12)] max-lg:motion-safe:animate-[panel-up_200ms_ease-out]";

// "Not answered" only comes up when reviewing a mock test; a check always has an answer.
function Feedback({ result, showsAnswer, fresh }: { result: CheckResult; showsAnswer: boolean; fresh: boolean }) {
  const { correct } = result;
  return (
    <p
      className={`flex items-start gap-[0.5em] ${fresh ? "rounded-xl" : "rounded-lg"} border-l-[0.3em] px-[0.9em] py-[0.6em] font-semibold ${
        correct ? "border-ok bg-ok-bg text-ok-strong" : "border-warn bg-warn-bg text-warn-strong"
      }`}
    >
      <MarkIcon name={correct ? "tick" : "cross"} className="mt-[0.15em] size-[1.1em] shrink-0" />
      <span>
        {correct ? "Correct." : result.answered ? "Not quite." : "Not answered."}
        {!correct && showsAnswer && <span className="font-normal"> The correct answer is highlighted.</span>}
      </span>
    </p>
  );
}

function FrameButton({
  primary = false,
  fresh = false,
  disabled = false,
  onClick,
  children,
}: {
  primary?: boolean;
  // Practice and Mock: the pressable look of the candidate buttons (same size as before).
  fresh?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[max(var(--answer-min-h,56px),var(--answer-min-em,3.5em))] items-center justify-center px-[1em] font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 ${
        fresh ? "rounded-xl shadow-[inset_0_-4px_0_var(--ycc-ink)] not-disabled:active:shadow-[inset_0_-2px_0_var(--ycc-ink)]" : "rounded-lg"
      } ${
        primary ? "hc-edge bg-primary text-white hover:bg-primary/90" : "border-2 border-primary bg-card text-primary hover:bg-primary/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}
