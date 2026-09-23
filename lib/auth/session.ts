import { cookies } from "next/headers";
import { verifyToken, type SessionPayload } from "./jwt";
import { AUTH_COOKIE_NAME } from "./constants";

// Reads and verifies the session cookie, for use in Server
// Components/Actions.
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}
