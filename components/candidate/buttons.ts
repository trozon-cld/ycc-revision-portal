// Shared candidate styles: pressable buttons (48px; the darker bottom edge thins and the label drops 2px when pressed, inside the button), cards, choice rows.
export const BUTTON_BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 px-5 pt-1 pb-1.5 text-base font-semibold shadow-[inset_0_-2px_0_var(--btn-edge)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:opacity-60 not-disabled:active:pt-1.5 not-disabled:active:pb-1 not-disabled:active:shadow-none";

export const PRIMARY_BUTTON = `${BUTTON_BASE} hc-edge border-primary border-b-ink [--btn-edge:var(--ycc-ink)] bg-primary text-white hover:bg-primary/90`;
export const SECONDARY_BUTTON = `${BUTTON_BASE} border-line border-b-edge [--btn-edge:var(--ycc-edge)] bg-card text-primary hover:bg-fill-soft`;

// A white card on the page tint.
export const CARD = "rounded-2xl border-2 border-line bg-card";

// A radio or checkbox row: the whole row is the target.
export const CHOICE_ROW =
  "flex min-h-14 cursor-pointer items-center gap-4 rounded-xl border-2 border-line bg-card px-4 py-3 hover:border-primary has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary has-disabled:cursor-default has-disabled:border-line-soft has-disabled:bg-fill has-disabled:text-ink/60";
export const CHOICE_INPUT = "size-6 shrink-0 accent-primary focus-visible:outline-none";

// Something went wrong or can't be done: one red box everywhere on candidate pages.
export const ERROR_BOX = "rounded-2xl border-2 border-danger bg-danger-bg p-4 text-base font-semibold text-danger-strong";

// A small label such as "Weak" or "Flagged"; add a tone (border, background and text colour).
export const BADGE = "inline-flex items-center gap-1 rounded-full border-2 px-2 text-sm font-semibold";

// Progress bars: the track and its filled part (set the height on the track).
export const BAR_TRACK = "overflow-hidden rounded-full bg-line-soft";
export const BAR_FILL = "hc-fill h-full rounded-full bg-primary";

// Boxes that stand out from the cards: a note or question (Cobalt), information, attention (orange), done (green).
export const NOTE_BOX = "rounded-2xl border-2 border-primary bg-primary/5";
export const INFO_BOX = "rounded-2xl border-2 border-primary/30 bg-primary/5";
export const WARN_BOX = "rounded-2xl border-2 border-warn bg-warn-bg text-warn-strong";
export const OK_BOX = "rounded-2xl border-2 border-ok bg-ok-bg text-ok-strong";

// Headings on candidate pages: page title 24px (28px on laptops), section title 20px (22px on laptops).
export const PAGE_TITLE = "text-2xl font-bold text-ink lg:text-[1.75rem]";
export const SECTION_TITLE = "text-xl font-bold text-ink lg:text-[1.375rem]";

// A compact radio or checkbox card for a grid (e.g. Practice's "Or focus on…").
export const CHOICE_TILE =
  "flex h-full cursor-pointer flex-col gap-2 rounded-xl border-2 border-line bg-card p-3 hover:border-primary has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary has-disabled:cursor-default has-disabled:border-line-soft has-disabled:bg-fill has-disabled:text-ink/60";

// Stacking order, lowest first (use these levels, not new numbers): page content and the Listen progress line
// (none) · bars that content scrolls under and fixed answer bars (z-10) · panels and overlays covering the pages
// (z-20) · the Handbook reader bar, whose Listen messages must show over the pages and panels, the bottom tab bar
// and staff row menus (z-30) · toasts, drag previews and the skip link (z-50) · dialogs (the browser's top layer).

// A soft shadow on bars that content scrolls under (top bars and the bottom tab bar); borders stay for high contrast.
export const SOFT_SHADOW = "shadow-[0_2px_8px_rgb(30_41_59/0.08)]";
export const BAR_SHADOW_TOP = `relative z-10 ${SOFT_SHADOW}`;
export const BAR_SHADOW_BOTTOM = "shadow-[0_-2px_8px_rgb(30_41_59/0.08)]";
// The candidate Handbook reader bar (with Listen): the same shadow, one level higher (see the stacking order above).
export const READER_BAR_LAYER = `relative z-30 ${SOFT_SHADOW}`;
