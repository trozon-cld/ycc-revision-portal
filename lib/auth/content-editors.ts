import type { UserRole } from "./jwt";

// Who edits the shared content: Handbook, question bank, media and General queries. Superadmin only for launch
// (decided 13 Oct); adding "admin" here gives Admins the same pages, actions and sidebar links.
export const CONTENT_EDITORS: readonly UserRole[] = ["superadmin"];
