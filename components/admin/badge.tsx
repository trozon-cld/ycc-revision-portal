import type { ReactNode } from "react";

const tones = {
  success: "bg-ok-bg text-ok-strong ring-ok/20",
  danger: "bg-danger-bg text-danger-strong ring-danger/20",
  warning: "bg-warn-bg text-warn-strong ring-warn/25",
  neutral: "bg-slate-100 text-slate-700 ring-slate-500/20",
  info: "bg-primary/10 text-primary ring-primary/20",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
