import type { ReactNode } from "react";

const tones = {
  success: "bg-green-50 text-green-800 ring-green-600/20",
  danger: "bg-red-50 text-red-800 ring-red-600/20",
  warning: "bg-amber-50 text-amber-900 ring-amber-600/25",
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
