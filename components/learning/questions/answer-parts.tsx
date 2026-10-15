// Tick and cross marks, and the result badge on text answers, shared by the question types.

import { Icon } from "@/components/icons";
import type { QuestionMode } from "@/lib/questions/types";

export type Mark = "tick" | "cross";

// Sized by className (e.g. size-[1.2em]) so it follows the question's text size.
export function MarkIcon({ name, className }: { name: Mark; className: string }) {
  return <Icon name={name} className={className} />;
}

export type OptionState = "plain" | "selected" | "correct" | "wrong";

const OPTION_TONES: Record<OptionState, string> = {
  plain: "border-line bg-card",
  selected: "border-primary bg-primary/[0.06]",
  correct: "border-ok bg-ok-bg",
  wrong: "border-warn bg-warn-bg",
};

// Corners, colours and edge of an answer option. Practice and Mock get the refreshed look; the Handbook ("learn")
// keeps its own until its turn (D4). Never changes sizes, so the book's page layout stays the same.
export function optionLook(mode: QuestionMode, state: OptionState, locked: boolean): string {
  if (mode === "learn") return `rounded-lg ${OPTION_TONES[state]}`;
  const tone = state === "selected" ? "border-primary bg-primary/10" : OPTION_TONES[state];
  const edge = locked ? "" : state === "selected" ? "shadow-[inset_0_-2px_0_var(--ycc-primary)]" : "shadow-[inset_0_-2px_0_var(--ycc-line)]";
  return `rounded-xl ${tone} ${edge}`;
}

// "Correct answer" / "Your answer" on the top edge of a text answer.
export function OptionStatus({ tone, icon, label }: { tone: string; icon: Mark; label: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute -top-[0.65em] right-[0.75em] flex items-center gap-[0.25em] rounded-full px-[0.55em] py-[0.08em] text-[max(14px,0.8em)] font-semibold leading-tight text-white ${tone}`}
    >
      <MarkIcon name={icon} className="size-[1.2em] shrink-0" />
      {label}
    </span>
  );
}
