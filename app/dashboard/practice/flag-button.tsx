"use client";

import { useState } from "react";
import { FlagToggle } from "@/components/candidate/flag-toggle";
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
      <FlagToggle flagged={flagged} onClick={toggle} disabled={busy} />
      <div aria-live="polite">{problem && <p className="mt-2 text-base font-semibold text-ink">This question can’t be flagged right now.</p>}</div>
    </div>
  );
}
