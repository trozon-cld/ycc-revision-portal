import { accessBaseDate, formatUkDate } from "@/lib/candidates/access";
import type { RowCandidate } from "./candidate-row-actions";

// What the candidate Actions menu needs, built the same way for the Candidates list and the Progress page.
export function toRowCandidate(candidate: {
  id: string;
  email: string;
  name: string | null;
  categoryId: string;
  categoryName: string;
  currentCategoryName: string;
  adminId: string;
  isBlocked: boolean;
  accessExpiresAt: Date | string | null;
}): RowCandidate {
  const expiresAt = candidate.accessExpiresAt;
  const isExpired = expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
  return {
    id: candidate.id,
    email: candidate.email,
    name: candidate.name,
    categoryId: candidate.categoryId,
    categoryLabel:
      candidate.currentCategoryName === candidate.categoryName
        ? candidate.categoryName
        : `${candidate.currentCategoryName} (assigned: ${candidate.categoryName})`,
    adminId: candidate.adminId,
    isBlocked: candidate.isBlocked,
    expiryLabel: expiresAt ? `${isExpired ? "Expired on" : "Expires"} ${formatUkDate(expiresAt)}` : "No expiry set",
    accessBase: accessBaseDate(expiresAt),
  };
}
