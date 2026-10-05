// Tick and cross marks, and the result badge on text answers, shared by the question types.

const PATHS = { tick: "M4 10.5l4 4 8-9", cross: "M5 5l10 10M15 5L5 15" } as const;
export type Mark = keyof typeof PATHS;

export function MarkIcon({ name, className, strokeWidth = "2.25" }: { name: Mark; className: string; strokeWidth?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
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
