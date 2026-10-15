"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TextSize } from "@/lib/content/book";
import type { PracticeStep } from "@/lib/practice/types";
import { QuestionView, type QuestionViewState } from "@/components/learning/questions/question-view";
import { CARD, ERROR_BOX, PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { useConfirmFocus } from "@/components/candidate/use-confirm-focus";
import { NOT_THROUGH_MESSAGE, reachServer } from "@/lib/forms";
import { FocusedShell } from "@/components/learning/focused-shell";
import { saveTextSize } from "@/app/dashboard/prepare/actions";
import { checkPracticeAnswer, endPracticeRun, nextPracticeQuestion } from "../actions";
import { FlagButton } from "../flag-button";

// One practice question at a time: Check answer (marked on the server), then Next question.
export function PracticeRunner({ initialStep, initialTextSize }: { initialStep: PracticeStep; initialTextSize: TextSize }) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [checked, setChecked] = useState(Boolean(initialStep.checked));
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Shown inside the End practice box, which sits over the page in Settings.
  const [endProblem, setEndProblem] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<TextSize>(initialTextSize);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  // A refresh (after the question changed on screen) brings the server's current step; the question
  // view starts afresh with it.
  const [shownStep, setShownStep] = useState(initialStep);
  const [reloads, setReloads] = useState(0);
  if (initialStep !== shownStep) {
    setShownStep(initialStep);
    setStep(initialStep);
    setChecked(Boolean(initialStep.checked));
    setReloads((count) => count + 1);
  }

  const isLast = step.position + 1 >= step.total;

  useEffect(() => {
    if (!moved.current) return;
    headingRef.current?.focus();
    scrollRef.current?.scrollTo({ top: 0 });
  }, [step.position]);

  // Back to the Practice page, which says why ("empty": ended with nothing answered; "closed": ended
  // elsewhere, e.g. another tab or a category change).
  function leave(why: "empty" | "closed") {
    router.push(`/dashboard/practice?ended=${why}`);
  }

  async function goNext() {
    setBusy(true);
    setMessage(null);
    setProblem(null);
    try {
      const reply = await nextPracticeQuestion(step.sessionId, step.position);
      if (!reply.ok) return leave("closed");
      if ("finished" in reply) return router.refresh();
      moved.current = true;
      setStep(reply.step);
      setChecked(Boolean(reply.step.checked));
    } catch {
      setProblem(NOT_THROUGH_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    setBusy(true);
    setEndProblem(null);
    try {
      const outcome = await endPracticeRun(step.sessionId);
      if (outcome === "finished") router.refresh();
      else leave(outcome === "removed" ? "empty" : "closed");
    } catch {
      setBusy(false);
      setEndProblem(NOT_THROUGH_MESSAGE);
    }
  }

  function changeSize(size: TextSize) {
    setTextSize(size);
    saveTextSize(size).catch(() => {});
  }

  const initialState: QuestionViewState | undefined = step.checked
    ? {
        response: null,
        phase: "checked",
        result: { answered: true, correct: step.checked.correct },
        notice: null,
        shown: { answer: step.checked.answer, explanation: step.checked.explanation },
      }
    : undefined;

  const { heading: endHeading, opener: endOpener } = useConfirmFocus(confirmEnd);
  const endControls = confirmEnd ? (
    <div role="group" aria-labelledby="end-heading" className="rounded-xl border-2 border-primary bg-primary/5 p-5">
      <h3 id="end-heading" ref={endHeading} tabIndex={-1} className="text-xl font-bold text-ink focus:outline-none">
        End practice now?
      </h3>
      <p className="mt-2 text-lg leading-relaxed text-ink">
        {step.answered > 0
          ? `You’ll see your results for the ${step.answered} question${step.answered === 1 ? "" : "s"} you answered.`
          : "You haven’t answered any questions yet, so there are no results to show."}
      </p>
      {endProblem && (
        <p role="alert" className={`mt-4 ${ERROR_BOX}`}>
          {endProblem}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={end} disabled={busy} className={PRIMARY_BUTTON}>
          {busy ? "Ending…" : "Yes, end practice"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirmEnd(false);
            setEndProblem(null);
          }}
          disabled={busy}
          className={SECONDARY_BUTTON}
        >
          Keep practising
        </button>
      </div>
    </div>
  ) : (
    <button type="button" ref={endOpener} onClick={() => setConfirmEnd(true)} className={`${SECONDARY_BUTTON} w-full`}>
      End practice
    </button>
  );

  return (
    <FocusedShell label="Practice tools"
      status={`Question ${step.position + 1} of ${step.total}`}
      shortStatus={`${step.position + 1} of ${step.total}`}
      progress={{ done: step.answered, total: step.total }}
      textSize={textSize}
      onTextSizeChange={changeSize}
      actions={endControls}
      scrollRef={scrollRef}
    >
      <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-12 sm:pt-8">
        <h1 ref={headingRef} tabIndex={-1} className="sr-only">
          Question {step.position + 1} of {step.total}
        </h1>
        <div className={`${CARD} px-4 py-5 text-ink sm:px-6`} style={{ fontSize: textSize }}>
          <QuestionView
            key={`${step.sessionId}:${step.position}:${reloads}`}
            question={step.question}
            label={step.chapterLabel}
            media={step.media}
            seed={`${step.sessionId}:${step.question.id}`}
            initialState={initialState}
            retry={false}
            onStateChange={(state) => setChecked(state.phase === "checked")}
            onCheck={async (response) => {
              const reply = await reachServer(() => checkPracticeAnswer(step.sessionId, step.position, response));
              if (!reply) return null;
              if (reply.ok) {
                setStep((current) => (current.position === step.position && !current.checked ? { ...current, answered: current.answered + 1 } : current));
                return reply.checked;
              }
              if (reply.reason === "moved") {
                leave("closed");
                return false;
              }
              if (reply.reason === "gone") {
                setMessage("That question is no longer available, so we’ve moved on.");
                goNext();
                return false;
              }
              // The question changed while on screen (or another tab moved on): load it again.
              setMessage("This question was updated, so we’ve loaded it again.");
              router.refresh();
              return false;
            }}
          />
        </div>

        <div aria-live="polite">
          {message && <p className="mt-4 text-lg font-semibold text-ink">{message}</p>}
          {problem && <p className={`mt-4 ${ERROR_BOX}`}>{problem}</p>}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
          {checked && (
            <button type="button" onClick={goNext} disabled={busy} className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
              {busy ? "Loading…" : isLast ? "See your results" : "Next question"}
            </button>
          )}
          <FlagButton key={`${step.sessionId}:${step.position}`} questionId={step.question.id} initialFlagged={step.flagged} />
        </div>
      </div>
    </FocusedShell>
  );
}
