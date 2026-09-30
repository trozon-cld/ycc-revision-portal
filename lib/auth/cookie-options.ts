// Shared by lib/auth/cookies.ts (actions, route handlers) and proxy.ts (renewal).
export function sessionCookieOptions(maxAge: number) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge };
}
