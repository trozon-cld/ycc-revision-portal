import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME } from "./constants";
import { sessionCookieOptions } from "./cookie-options";
import { signToken, type SessionClaims } from "./jwt";

// Server Actions / Route Handlers only — not proxy.ts, which uses
// NextRequest/NextResponse cookies instead.

export async function setSessionCookie(claims: SessionClaims) {
  const { token, maxAge } = await signToken(claims);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, sessionCookieOptions(maxAge));
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}
