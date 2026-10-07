import { Badge } from "@/components/admin/badge";

// Blocked wins over expired; no expiry date counts as active.
export function CandidateStatusBadge({ isBlocked, isExpired }: { isBlocked: boolean; isExpired: boolean }) {
  if (isBlocked) return <Badge tone="danger">Blocked</Badge>;
  if (isExpired) return <Badge tone="warning">Expired</Badge>;
  return <Badge tone="success">Active</Badge>;
}
