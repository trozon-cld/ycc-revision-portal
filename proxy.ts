import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyToken, type SessionPayload } from "@/lib/auth/jwt";
import { AUTH_COOKIE_NAME, RENEW_AFTER_SECONDS } from "@/lib/auth/constants";
import { sessionCookieOptions } from "@/lib/auth/cookie-options";

// Optimistic routing by role from the sign-in cookie, and renewal of sign-ins in use. Blocking,
// expiry and password changes are checked live by requireRole (lib/auth/guard.ts) on every page.

const ADMIN_PREFIX = "/admin";
const CANDIDATE_PREFIX = "/dashboard";
const LOGIN_PATH = "/login";
const HOME = { superadmin: ADMIN_PREFIX, admin: ADMIN_PREFIX, candidate: CANDIDATE_PREFIX } as const;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isEntry = pathname === "/" || pathname === LOGIN_PATH;
  const isAdmin = pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
  const isCandidate = pathname === CANDIDATE_PREFIX || pathname.startsWith(`${CANDIDATE_PREFIX}/`);
  if (!isEntry && !isAdmin && !isCandidate) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  // Signed in: the home page and the login form go straight to the user's own area.
  if (isEntry) {
    const home = session ? HOME[session.role] : undefined;
    if (!home || request.nextUrl.searchParams.has("ended")) return NextResponse.next();
    return renew(NextResponse.redirect(new URL(home, request.url)), session);
  }

  if (!session) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  // Wrong area for this role: go to the user's own area.
  const own = HOME[session.role];
  if ((isAdmin && own !== ADMIN_PREFIX) || (isCandidate && own !== CANDIDATE_PREFIX)) {
    return renew(NextResponse.redirect(new URL(own ?? LOGIN_PATH, request.url)), session);
  }
  return renew(NextResponse.next(), session);
}

// Idle limit: a sign-in in use is re-issued (at most every RENEW_AFTER_SECONDS), never past its
// absolute limit. A revoked one gains nothing: requireRole still checks it against the database.
async function renew(response: NextResponse, session: SessionPayload | null) {
  const now = Math.floor(Date.now() / 1000);
  if (!session || now - (session.iat ?? 0) < RENEW_AFTER_SECONDS) return response;
  const { token, maxAge } = await signToken({
    sub: session.sub,
    email: session.email,
    role: session.role,
    ver: session.ver,
    loginAt: session.loginAt,
  });
  if (maxAge > 0) response.cookies.set(AUTH_COOKIE_NAME, token, sessionCookieOptions(maxAge));
  return response;
}

export const config = {
  matcher: ["/", "/login", "/admin/:path*", "/dashboard/:path*"],
};
