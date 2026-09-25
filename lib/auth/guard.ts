import { redirect } from "next/navigation";
import { getSession } from "./session";
import type { SessionPayload, UserRole } from "./jwt";

// Use in Server Components AND Server Actions — actions are callable
// endpoints, so they can't rely on the page having checked already.
export async function requireRole(
  allowedRoles: UserRole[]
): Promise<SessionPayload> {
  const session = await getSession();
  if (!session || !allowedRoles.includes(session.role)) {
    redirect("/login");
  }
  return session;
}
