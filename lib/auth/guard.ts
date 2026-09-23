import { redirect } from "next/navigation";
import { getSession } from "./session";
import type { SessionPayload, UserRole } from "./jwt";

// Server Components AND Server Actions — Server Actions are independently
// callable endpoints, so they must re-check authorization themselves rather
// than trusting that the page that renders their form already did.
export async function requireRole(
  allowedRoles: UserRole[]
): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || !allowedRoles.includes(session.role)) {
    redirect("/login");
  }
  return session;
}
