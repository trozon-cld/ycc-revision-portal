// Every logged action and its display label. New loggable actions go here.
export const ACTIVITY_ACTIONS = {
  "admin.created": "Created admin",
  "admin.email_changed": "Changed admin email",
  "admin.password_changed": "Changed admin password",
  "admin.deleted": "Deleted admin",
  "category.created": "Created category",
  "category.renamed": "Renamed category",
  "category.deleted": "Deleted category",
  "candidate.admin_changed": "Moved candidate to another admin",
  "account.email_changed": "Changed own email",
  "account.password_changed": "Changed own password",
  "candidate.created": "Created candidate",
  "candidate.email_changed": "Changed candidate email",
  "candidate.password_changed": "Changed candidate password",
  "candidate.category_changed": "Changed candidate category",
  "candidate.access_changed": "Changed candidate access",
  "candidate.blocked": "Blocked candidate",
  "candidate.unblocked": "Unblocked candidate",
  "candidate.deleted": "Deleted candidate",
} as const;

export type ActivityAction = keyof typeof ACTIVITY_ACTIONS;

export const ADMIN_ACTIONS = (Object.keys(ACTIVITY_ACTIONS) as ActivityAction[]).filter(
  (action) => action.startsWith("candidate.") && action !== "candidate.admin_changed"
);

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
