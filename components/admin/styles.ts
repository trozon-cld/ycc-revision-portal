// Admin-only compact styles. Candidate pages keep the large-target style.

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const buttonBase = `inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 ${focusRing}`;

const buttonVariants = {
  primary: "bg-primary text-white hover:bg-primary/90",
  secondary: "border border-slate-300 bg-white text-ink hover:bg-slate-50",
  danger: "bg-red-700 text-white hover:bg-red-800",
  ghost: "text-ink hover:bg-slate-100",
} as const;

const buttonSizes = {
  md: "h-10 px-3.5 text-sm sm:h-9",
  sm: "h-9 px-3 text-sm sm:h-8 sm:px-2.5",
  icon: "size-10 sm:size-8",
} as const;

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md") {
  return `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]}`;
}

// 16px text on phones stops iOS zooming into focused fields.
export const inputClass =
  "block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-base text-ink placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 sm:h-9 sm:text-sm";

export const labelClass = "block text-sm font-medium text-ink";

export const cardClass = "rounded-lg border border-slate-200 bg-white";

export const textareaClass =
  "block min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-ink placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 sm:text-sm";

export const fileInputClass =
  "block w-full text-sm text-ink file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:text-sm file:font-medium file:text-ink hover:file:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:file:h-9";
