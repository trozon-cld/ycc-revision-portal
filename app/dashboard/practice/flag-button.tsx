"use client";

import { useState } from "react";
import { setQuestionFlag } from "./actions";

// Flag for review: the candidate's own bookmark on a question, to practise later.
export function FlagButton({ questionId, initialFlagged, className = "" }: { questionId: string; initialFlagged: boolean; className?: string }) {
  const [flagged, setFlagged] = useState(initialFlagged);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);

  async function toggle() {
    const next = !flagged;
    setFlagged(next);
    setBusy(true);
    setProblem(false);
    try {
      const saved = await setQuestionFlag(questionId, next);
      if (saved === null) {
        setFlagged(!next);
        setProblem(true);
      } else setFlagged(saved);
    } catch {
      setFlagged(!next);
      setProblem(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-pressed={flagged}
        onClick={toggle}
        disabled={busy}
        className={`inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 px-6 text-lg font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto ${
          flagged ? "border-amber-700 bg-amber-50 text-amber-950 hover:bg-amber-100" : "border-ink/25 bg-white text-ink hover:border-primary hover:text-primary"
        }`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 shrink-0" fill={flagged ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M5 21V4m0 0h11l-2 4 2 4H5" />
        </svg>
        {flagged ? "Flagged for review" : "Flag for review"}
      </button>
      <div aria-live="polite">{problem && <p className="mt-2 text-base font-semibold text-ink">This question can’t be flagged right now.</p>}</div>
    </div>
  );
}
