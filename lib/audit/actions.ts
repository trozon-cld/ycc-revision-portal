// Every logged action and its display label. New loggable actions go here.
export const ACTIVITY_ACTIONS = {
  "admin.created": "Created admin",
  "admin.email_changed": "Changed admin email",
  "admin.password_changed": "Changed admin password",
  "admin.name_changed": "Changed admin name",
  "admin.deleted": "Deleted admin",
  "candidate.created": "Created candidate",
  "candidate.email_changed": "Changed candidate email",
  "candidate.name_changed": "Changed candidate name",
  "candidate.password_changed": "Changed candidate password",
  "candidate.category_changed": "Changed candidate category",
  "candidate.access_changed": "Changed candidate access",
  "candidate.blocked": "Blocked candidate",
  "candidate.unblocked": "Unblocked candidate",
  "candidate.deleted": "Deleted candidate",
  "candidate.admin_changed": "Moved candidate to another admin",
  "candidate.category_switched": "Candidate switched category",
  "category_group.created": "Created category group",
  "category_group.renamed": "Renamed category group",
  "category_group.reordered": "Reordered category group",
  "category_group.deleted": "Deleted category group",
  "category.created": "Created category",
  "category.renamed": "Renamed category",
  "category.group_changed": "Moved category to another group",
  "category.chapters_changed": "Changed category chapters",
  "category.covers_changed": "Changed Handbook covers",
  "category.deleted": "Deleted category",
  "section.created": "Created section",
  "section.renamed": "Renamed section",
  "section.reordered": "Reordered section",
  "section.deleted": "Deleted section",
  "chapter.created": "Created chapter",
  "chapter.renamed": "Renamed chapter",
  "chapter.reordered": "Reordered chapter",
  "chapter.section_changed": "Moved chapter to another section",
  "chapter.categories_changed": "Changed chapter categories",
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
  "media.uploaded": "Uploaded picture",
  "media.alt_text_changed": "Changed picture description",
  "media.deleted": "Deleted picture",
  "account.email_changed": "Changed own email",
  "account.name_changed": "Changed own name",
  "account.password_changed": "Changed own password",
} as const;

export type ActivityAction = keyof typeof ACTIVITY_ACTIONS;

export const ADMIN_ACTIONS = (Object.keys(ACTIVITY_ACTIONS) as ActivityAction[]).filter(
  (action) => action.startsWith("candidate.") && action !== "candidate.admin_changed"
);

// Groups actions by area for the "Type of action" filter; matched by the part before the dot.
export const ACTION_AREAS: { label: string; prefixes: string[] }[] = [
  { label: "Admins", prefixes: ["admin"] },
  { label: "Candidates", prefixes: ["candidate"] },
  { label: "Categories", prefixes: ["category_group", "category"] },
  { label: "Handbook", prefixes: ["section", "chapter", "content_page"] },
  { label: "Question bank", prefixes: ["question"] },
  { label: "Media", prefixes: ["media"] },
  { label: "Own account", prefixes: ["account"] },
];

export const AUTH_EVENTS = {
  login_success: "Logged in",
  login_failed: "Failed login attempt",
  logout: "Logged out",
} as const;

export type AuthEvent = keyof typeof AUTH_EVENTS;

export function isActivityAction(value: string): value is ActivityAction {
  return Object.hasOwn(ACTIVITY_ACTIONS, value);
}

export function isAuthEvent(value: string): value is AuthEvent {
  return Object.hasOwn(AUTH_EVENTS, value);
}
