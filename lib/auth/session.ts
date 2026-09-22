import { cookies } from "next/headers";
import { verifyToken, type SessionPayload } from "./jwt";
import { AUTH_COOKIE_NAME } from "./constants";

// Server Components / Server Actions helper — reads and verifies the
// session cookie. Middleware already gates /admin/* and /dashboard/*, but
// pages check again defensively rather than trusting that every request
// necessarily passed through it.
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
