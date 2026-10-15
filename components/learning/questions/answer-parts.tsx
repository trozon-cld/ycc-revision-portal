// Tick and cross marks, and the result badge on text answers, shared by the question types.

import { Icon } from "@/components/icons";

export type Mark = "tick" | "cross";

// Sized by className (e.g. size-[1.2em]) so it follows the question's text size.
export function MarkIcon({ name, className }: { name: Mark; className: string }) {
  return <Icon name={name} className={className} />;
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
