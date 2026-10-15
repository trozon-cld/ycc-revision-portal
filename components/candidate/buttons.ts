// Shared candidate styles: pressable buttons (48px, a darker bottom edge that flattens when pressed), cards, choice rows.
export const BUTTON_BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-b-4 px-5 py-1 text-base font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-60 not-disabled:active:mb-0.5 not-disabled:active:translate-y-0.5 not-disabled:active:border-b-2";

export const PRIMARY_BUTTON = `${BUTTON_BASE} hc-edge border-primary border-b-ink bg-primary text-white hover:bg-primary/90`;
export const SECONDARY_BUTTON = `${BUTTON_BASE} border-line border-b-edge bg-card text-primary hover:bg-fill-soft`;

// A white card on the page tint.
export const CARD = "rounded-2xl border-2 border-line bg-card";

// A radio or checkbox row: the whole row is the target.
export const CHOICE_ROW =
  "flex min-h-14 cursor-pointer items-center gap-4 rounded-xl border-2 border-line bg-card px-4 py-3 hover:border-primary has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary has-disabled:cursor-default has-disabled:border-line-soft has-disabled:bg-fill has-disabled:text-ink/60";
export const CHOICE_INPUT = "size-6 shrink-0 accent-primary focus-visible:outline-none";

// Something went wrong or can't be done: one red box everywhere on candidate pages.
export const ERROR_BOX = "rounded-xl border-2 border-danger bg-danger-bg p-4 text-base font-semibold text-danger-strong";

// A small label such as "Weak" or "Flagged"; add a tone (border, background and text colour).
export const BADGE = "inline-flex items-center gap-1 rounded-full border-2 px-2 text-sm font-semibold";

// Progress bars: the track and its filled part (set the height on the track).
export const BAR_TRACK = "overflow-hidden rounded-full bg-line-soft";
export const BAR_FILL = "hc-fill h-full rounded-full bg-primary";
