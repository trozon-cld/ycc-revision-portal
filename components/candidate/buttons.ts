// Large candidate controls (56px+, high contrast), matching the home and category pages.
const BASE =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-lg px-6 text-lg font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-60";

export const PRIMARY_BUTTON = `${BASE} bg-primary text-white hover:bg-primary/90`;
export const SECONDARY_BUTTON = `${BASE} border-2 border-ink/25 bg-white text-ink hover:border-primary hover:text-primary`;

// A radio or checkbox row: the whole row is the target.
export const CHOICE_ROW =
  "flex min-h-16 cursor-pointer items-center gap-4 rounded-xl border-2 border-ink/20 bg-white px-5 py-3 hover:border-primary has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary has-disabled:cursor-default has-disabled:border-ink/10 has-disabled:bg-ink/5 has-disabled:text-ink/60";
export const CHOICE_INPUT = "size-6 shrink-0 accent-primary focus-visible:outline-none";
