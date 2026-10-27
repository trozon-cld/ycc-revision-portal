import { accessBaseDate, formatUkDate } from "@/lib/candidates/access";
import type { RowCandidate } from "./candidate-row-actions";

// What the candidate Actions menu needs, built the same way for the Candidates list and the Progress page.
export function toRowCandidate(candidate: {
  id: string;
  email: string;
  name: string | null;
  testTypeId: string;
  testTypeName: string;
  currentTestTypeName: string;
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
    testTypeId: candidate.testTypeId,
    testTypeLabel:
      candidate.currentTestTypeName === candidate.testTypeName
        ? candidate.testTypeName
        : `${candidate.currentTestTypeName} (assigned: ${candidate.testTypeName})`,
    adminId: candidate.adminId,
    isBlocked: candidate.isBlocked,
    expiryLabel: expiresAt ? `${isExpired ? "Expired on" : "Expires"} ${formatUkDate(expiresAt)}` : "No expiry set",
    accessBase: accessBaseDate(expiresAt),
  };
}
