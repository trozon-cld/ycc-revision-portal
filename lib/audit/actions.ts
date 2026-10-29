// Every logged action and its display label. New loggable actions go here.
export const ACTIVITY_ACTIONS = {
  "admin.created": "Created Admin",
  "admin.email_changed": "Changed Admin email",
  "admin.password_changed": "Changed Admin password",
  "admin.name_changed": "Changed Admin name",
  "admin.deleted": "Deleted Admin",
  "candidate.created": "Created candidate",
  "candidate.email_changed": "Changed candidate email",
  "candidate.name_changed": "Changed candidate name",
  "candidate.password_changed": "Changed candidate password",
  "candidate.test_type_changed": "Changed candidate test type",
  "candidate.access_changed": "Changed candidate access",
  "candidate.blocked": "Blocked candidate",
  "candidate.unblocked": "Unblocked candidate",
  "candidate.deleted": "Deleted candidate",
  "candidate.admin_changed": "Moved candidate to another Admin",
  "candidate.test_type_switched": "Candidate switched test type",
  "test_area.created": "Created test area",
  "test_area.renamed": "Renamed test area",
  "test_area.reordered": "Reordered test area",
  "test_area.deleted": "Deleted test area",
  "test_type.created": "Created test type",
  "test_type.renamed": "Renamed test type",
  "test_type.reordered": "Reordered test type",
  "test_type.area_changed": "Moved test type to another test area",
  "test_type.chapters_changed": "Changed test type chapters",
  "test_type.listen_changed": "Turned Listen on or off for test type",
  "test_type.listen_languages_changed": "Changed Listen languages for test type",
  "test_type.covers_changed": "Changed Handbook covers",
  "test_type.deleted": "Deleted test type",
  "section.created": "Created section",
  "section.renamed": "Renamed section",
  "section.reordered": "Reordered section",
  "section.deleted": "Deleted section",
  "chapter.created": "Created chapter",
  "chapter.renamed": "Renamed chapter",
  "chapter.reordered": "Reordered chapter",
  "chapter.section_changed": "Moved chapter to another section",
  "chapter.test_types_changed": "Changed chapter test types",
  "chapter.deleted": "Deleted chapter",
  "chapter.published": "Published chapter",
  "chapter.unpublished": "Unpublished chapter",
  "content_page.created": "Created page",
  "content_page.renamed": "Renamed page",
  "content_page.updated": "Edited page content",
  "content_page.reordered": "Reordered page",
  "content_page.published": "Published page",
  "content_page.unpublished": "Unpublished page",
  "content_page.deleted": "Deleted page",
  "content.imported": "Imported content",
  "content.backup_downloaded": "Downloaded backup",
  "content.backup_restored": "Restored backup",
  "page_translation.generated": "Translated page",
  "page_translation.edited": "Edited page translation",
  "page_translation.checked": "Checked page translation",
  "page_audio.generated": "Made page audio",
  "page_audio.deleted": "Deleted page audio",
  "question.created": "Created question",
  "question.updated": "Edited question",
  "question.chapter_changed": "Moved question to another chapter",
  "question.usage_changed": "Changed where a question is used",
  "question.published": "Published question",
  "question.unpublished": "Unpublished question",
  "question.deleted": "Deleted question",
  "question.added_to_handbook": "Added question to Handbook",
  "question.removed_from_handbook": "Removed question from Handbook",
  "question.reordered": "Reordered question",
  "question_translation.generated": "Translated question",
  "question_translation.edited": "Edited question translation",
  "question_translation.checked": "Checked question translation",
  "question_audio.generated": "Made question audio",
  "question_audio.deleted": "Deleted question audio",
  "language.added": "Added Listen language",
  "language.phrases_drafted": "Drafted spoken phrases",
  "language.phrases_edited": "Edited spoken phrases",
  "language.phrases_checked": "Checked spoken phrases",
  "language.published": "Made Listen language live",
  "language.hidden": "Hid Listen language",
  "language.restored": "Showed Listen language again",
  "language.deleted": "Deleted Listen language",
  "media.uploaded": "Uploaded picture",
  "media.replaced": "Replaced picture",
  "media.alt_text_changed": "Changed picture description",
  "media.deleted": "Deleted picture",
  "faq.created": "Created question in General queries",
  "faq.updated": "Edited question in General queries",
  "faq.reordered": "Reordered question in General queries",
  "faq.published": "Published question in General queries",
  "faq.unpublished": "Unpublished question in General queries",
  "faq.deleted": "Deleted question in General queries",
  "support_contact.changed": "Changed support contact details",
  "account.email_changed": "Changed own email",
  "account.name_changed": "Changed own name",
  "account.password_changed": "Changed own password",
  "account.language_changed": "Changed listening language",
  "log.login_records_archived": "Archived old login records",
} as const;

export type ActivityAction = keyof typeof ACTIVITY_ACTIONS;

export const ADMIN_ACTIONS = (Object.keys(ACTIVITY_ACTIONS) as ActivityAction[]).filter(
  (action) => (action.startsWith("candidate.") && action !== "candidate.admin_changed") || action.startsWith("account.")
);

// Groups actions by area for the "Type of action" filter; matched by the part before the dot.
export const ACTION_AREAS: { label: string; prefixes: string[] }[] = [
  { label: "Admins", prefixes: ["admin"] },
  { label: "Candidates", prefixes: ["candidate"] },
  { label: "Test types", prefixes: ["test_area", "test_type"] },
  { label: "Handbook", prefixes: ["section", "chapter", "content_page", "content", "page_translation", "page_audio"] },
  { label: "Question bank", prefixes: ["question", "question_translation", "question_audio"] },
  { label: "Languages", prefixes: ["language"] },
  { label: "Media", prefixes: ["media"] },
  { label: "General queries", prefixes: ["faq", "support_contact"] },
  { label: "Own account", prefixes: ["account"] },
  { label: "Log archives", prefixes: ["log"] },
];

// Keys renamed in 0037 (groups became test areas, categories test types). Older log entries keep the old key.
const RENAMED_ACTIONS: Record<string, ActivityAction> = {
  "candidate.category_changed": "candidate.test_type_changed",
  "candidate.category_switched": "candidate.test_type_switched",
  "category_group.created": "test_area.created",
  "category_group.renamed": "test_area.renamed",
  "category_group.reordered": "test_area.reordered",
  "category_group.deleted": "test_area.deleted",
  "category.created": "test_type.created",
  "category.renamed": "test_type.renamed",
  "category.group_changed": "test_type.area_changed",
  "category.chapters_changed": "test_type.chapters_changed",
  "category.listen_changed": "test_type.listen_changed",
  "category.listen_languages_changed": "test_type.listen_languages_changed",
  "category.covers_changed": "test_type.covers_changed",
  "category.deleted": "test_type.deleted",
  "chapter.categories_changed": "chapter.test_types_changed",
};

// A stored key as today's action (old keys included), or null if it isn't one.
export function currentAction(stored: string): ActivityAction | null {
  if (isActivityAction(stored)) return stored;
  return RENAMED_ACTIONS[stored] ?? null;
}

// Every stored key that means this action: itself and any older name for it.
export function storedKeys(action: ActivityAction): string[] {
  return [action, ...Object.keys(RENAMED_ACTIONS).filter((old) => RENAMED_ACTIONS[old] === action)];
}

export const AUTH_EVENTS = {
  login_success: "Logged in",
  login_failed: "Failed login attempt",
  logout: "Logged out",
  // Written once when too many failed attempts pause logins for an email or address (lib/auth/rate-limit.ts).
  login_paused: "Logins paused (too many failed attempts)",
  password_check_failed: "Wrong current password (My account)",
} as const;

export type AuthEvent = keyof typeof AUTH_EVENTS;

export function isActivityAction(value: string): value is ActivityAction {
  return Object.hasOwn(ACTIVITY_ACTIONS, value);
}

export function isAuthEvent(value: string): value is AuthEvent {
  return Object.hasOwn(AUTH_EVENTS, value);
}
