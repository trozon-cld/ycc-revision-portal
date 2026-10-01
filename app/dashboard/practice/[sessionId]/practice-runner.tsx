"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TEXT_SIZES, type TextSize } from "@/lib/content/book";
import type { PracticeStep } from "@/lib/practice/types";
import { QuestionView, type QuestionViewState } from "@/components/learning/questions/question-view";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { saveTextSize } from "@/app/dashboard/prepare/actions";
import { checkPracticeAnswer, endPracticeRun, nextPracticeQuestion } from "../actions";

const SIZE_BUTTON =
  "inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border-2 border-ink/25 bg-white px-3 text-lg font-bold text-ink hover:border-primary hover:text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50";

// One practice question at a time: Check answer (marked on the server), then Next question.
export function PracticeRunner({ initialStep, initialTextSize }: { initialStep: PracticeStep; initialTextSize: TextSize }) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [checked, setChecked] = useState(Boolean(initialStep.checked));
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<TextSize>(initialTextSize);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const isLast = step.position + 1 >= step.total;
  const sizeIndex = TEXT_SIZES.indexOf(textSize);

  useEffect(() => {
    if (!moved.current) return;
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step.position]);

  function leave() {
    router.push("/dashboard/practice");
  }

  async function goNext() {
    setBusy(true);
    setMessage(null);
    try {
      const reply = await nextPracticeQuestion(step.sessionId, step.position);
      if (!reply.ok) return leave();
      if ("finished" in reply) return router.refresh();
      moved.current = true;
      setStep(reply.step);
      setChecked(Boolean(reply.step.checked));
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function end() {
    setBusy(true);
    try {
      const outcome = await endPracticeRun(step.sessionId);
      if (outcome === "finished") router.refresh();
      else leave();
    } catch {
      setBusy(false);
      setMessage("Something went wrong. Please try again.");
    }
  }

  function changeSize(index: number) {
    const size = TEXT_SIZES[Math.max(0, Math.min(TEXT_SIZES.length - 1, index))];
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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-12 sm:pt-8">
      <div className="flex items-center justify-between gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-ink focus:outline-none sm:text-3xl">
          Question {step.position + 1} of {step.total}
        </h1>
        <div role="group" aria-label="Text size" className="flex shrink-0 gap-2">
          <button type="button" className={SIZE_BUTTON} onClick={() => changeSize(sizeIndex - 1)} disabled={sizeIndex <= 0} aria-label="Smaller text">
            A−
          </button>
          <button type="button" className={SIZE_BUTTON} onClick={() => changeSize(sizeIndex + 1)} disabled={sizeIndex >= TEXT_SIZES.length - 1} aria-label="Larger text">
            A+
          </button>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Practice progress"
        aria-valuemin={0}
        aria-valuemax={step.total}
        aria-valuenow={step.answered}
        aria-valuetext={`${step.answered} of ${step.total} answered`}
        className="mt-3 h-3 overflow-hidden rounded-full bg-ink/10"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${(step.answered / step.total) * 100}%` }} />
      </div>

      <div className="mt-5 rounded-xl border-2 border-ink/15 bg-white px-4 py-5 text-ink sm:px-6" style={{ fontSize: textSize }}>
        <QuestionView
          key={`${step.sessionId}:${step.position}`}
          question={step.question}
          label={step.chapterLabel}
          media={step.media}
          seed={`${step.sessionId}:${step.question.id}`}
          initialState={initialState}
          retry={false}
          onStateChange={(state) => setChecked(state.phase === "checked")}
          onCheck={async (response) => {
            const reply = await checkPracticeAnswer(step.sessionId, step.position, response);
            if (reply.ok) {
              setStep((current) => (current.position === step.position && !current.checked ? { ...current, answered: current.answered + 1 } : current));
              return reply.checked;
            }
            if (reply.reason === "moved") leave();
            if (reply.reason === "gone") {
              setMessage("That question is no longer available, so we’ve moved on.");
              goNext();
            }
            return null;
          }}
        />
      </div>

      <div aria-live="polite">{message && <p className="mt-4 text-lg font-semibold text-ink">{message}</p>}</div>

      {checked && !confirmEnd && (
        <button type="button" onClick={goNext} disabled={busy} className={`${PRIMARY_BUTTON} mt-5 w-full sm:w-auto`}>
          {busy ? "Loading…" : isLast ? "See my results" : "Next question"}
        </button>
      )}

      <div className="mt-10 border-t border-ink/15 pt-6">
        {confirmEnd ? (
          <div role="group" aria-labelledby="end-heading" className="rounded-xl border-2 border-ink/20 bg-white p-5">
            <h2 id="end-heading" className="text-xl font-bold text-ink">
              End practice now?
            </h2>
            <p className="mt-2 text-lg text-ink">
              {step.answered > 0
                ? `You’ll see your results for the ${step.answered} question${step.answered === 1 ? "" : "s"} you answered.`
                : "You haven’t answered any questions yet, so there are no results to show."}
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={end} disabled={busy} className={PRIMARY_BUTTON}>
                Yes, end practice
              </button>
              <button type="button" onClick={() => setConfirmEnd(false)} disabled={busy} className={SECONDARY_BUTTON}>
                Keep practising
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmEnd(true)} className={`${SECONDARY_BUTTON} w-full sm:w-auto`}>
            End practice
          </button>
        )}
      </div>
    </div>
  );
}
