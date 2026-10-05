"use client";

import type { RefObject } from "react";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/candidate/buttons";
import { countOf } from "@/lib/format";

// The review screen before submitting: every question as a numbered tile (answered, not answered,
// flagged); a tile opens that question. Submit asks once, in the page.
export function MockReview({
  answered,
  flags,
  headingRef,
  confirming,
  submitting,
  problem,
  onOpen,
  onBack,
  onSubmit,
  onConfirm,
  onCancel,
}: {
  answered: boolean[];
  flags: boolean[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  confirming: boolean;
  submitting: boolean;
  problem: string | null;
  onOpen: (position: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const done = answered.filter(Boolean).length;
  const open = answered.length - done;
  const flagged = flags.filter(Boolean).length;

  return (
    <div>
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-ink focus:outline-none">
        Review your answers
      </h1>
      <p className="mt-2 text-lg text-ink">
        {done} answered · {open} not answered · {flagged} flagged
      </p>
      <p className="mt-1 text-base text-ink/80">Choose a number to go to that question.</p>

      <ol className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-2">
        {answered.map((isAnswered, index) => {
          const isFlagged = flags[index];
          const state = [isAnswered ? "answered" : "not answered", isFlagged && "flagged"].filter(Boolean).join(", ");
          return (
            <li key={index}>
              <button
                type="button"
                onClick={() => onOpen(index)}
                aria-label={`Question ${index + 1}: ${state}`}
                className={`relative flex h-14 w-full items-center justify-center rounded-lg border-2 text-lg font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  isAnswered ? "border-primary bg-primary text-white hover:bg-primary/90" : "border-dashed border-ink/40 bg-white text-ink hover:border-primary"
                }`}
              >
                {index + 1}
                {isFlagged && (
                  <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border-2 border-white bg-amber-500 text-amber-950">
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                      <path d="M5 21V4m0 0h11l-2 4 2 4H5" />
                    </svg>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-base text-ink" aria-label="Key">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-5 rounded border-2 border-primary bg-primary" /> Answered
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-5 rounded border-2 border-dashed border-ink/40 bg-white" /> Not answered
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-5 rounded-full bg-amber-500" /> Flagged
        </li>
      </ul>

      <div className="mt-8">
        {confirming ? (
          <div role="group" aria-labelledby="submit-heading" className="rounded-xl border-2 border-primary bg-primary/5 p-5">
            <h2 id="submit-heading" className="text-xl font-bold text-ink">
              Submit your test now?
            </h2>
            <p className="mt-2 text-lg leading-relaxed text-ink">
              {open > 0 ? `You have ${countOf(open, "question")} not answered. ` : "You have answered every question. "}
              You can’t change your answers after submitting.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={onConfirm} disabled={submitting} className={PRIMARY_BUTTON}>
                {submitting ? "Submitting…" : "Yes, submit my test"}
              </button>
              <button type="button" onClick={onCancel} disabled={submitting} className={SECONDARY_BUTTON}>
                Not yet
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={onSubmit} className={`${PRIMARY_BUTTON} w-full sm:w-auto`}>
              Submit test
            </button>
            <button type="button" onClick={onBack} className={`${SECONDARY_BUTTON} w-full sm:w-auto`}>
              Back to the questions
            </button>
          </div>
        )}
        <div aria-live="polite">{problem && <p className="mt-4 text-lg font-semibold text-red-800">{problem}</p>}</div>
      </div>
    </div>
  );
}
