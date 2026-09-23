import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, SESSION_DURATION_SECONDS } from "./constants";

// Server Actions / Route Handlers only — not proxy.ts, which uses
// NextRequest/NextResponse cookies instead.

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
