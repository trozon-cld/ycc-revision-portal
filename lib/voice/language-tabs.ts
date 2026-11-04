// The tabs under the Languages sidebar item, which opens the Languages tab first.
export const LANGUAGES_PAGES_PATH = "/admin/handbook/languages";
export const LANGUAGES_MANAGE_PATH = "/admin/handbook/languages/manage";
export const LANGUAGES_BULK_PATH = "/admin/handbook/languages/bulk";
export const LANGUAGE_TABS = [
  { href: LANGUAGES_MANAGE_PATH, label: "Languages" },
  { href: LANGUAGES_PAGES_PATH, label: "Pages" },
  { href: LANGUAGES_BULK_PATH, label: "Batch Generate" },
];
