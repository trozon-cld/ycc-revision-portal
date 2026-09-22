import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, SESSION_DURATION_SECONDS } from "./constants";

// Server Actions / Route Handlers only — not usable from Middleware, which
// reads/writes cookies through the NextRequest/NextResponse APIs instead.
// NOTE: confirm this still matches Next 16's cookies() API (see AGENTS.md's
// warning to check node_modules/next/dist/docs before relying on it).

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}
