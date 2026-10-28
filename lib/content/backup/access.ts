import type { UserRole } from "@/lib/auth/jwt";

// The tabs under the Backup & Restore sidebar item. Upload content is for every content editor;
// Backup and Restore are the Superadmin's only (they cover the structure too).
export const UPLOAD_PATH = "/admin/backup";
export const BACKUP_PATH = "/admin/backup/download";
export const BACKUP_ROLES: readonly UserRole[] = ["superadmin"];

export function backupTabs(role: UserRole): { href: string; label: string; disabled?: boolean }[] {
  const upload = { href: UPLOAD_PATH, label: "Upload content" };
  if (!BACKUP_ROLES.includes(role)) return [upload];
  return [upload, { href: BACKUP_PATH, label: "Backup" }, { href: "/admin/backup/restore", label: "Restore", disabled: true }];
}
