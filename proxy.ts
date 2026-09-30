import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";

// Claims-based guard: role/block/expiry come from the JWT, no DB call.
// Next 16's Proxy can run Node code now, so a live check is possible later.

const ADMIN_PREFIX = "/admin";
const CANDIDATE_PREFIX = "/dashboard";
const LOGIN_PATH = "/login";
const EXPIRED_PATH = "/access-expired";
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
  // A blocked or expired candidate lands on /access-expired from there, which has Log out.
  if (isEntry) {
    const home = session ? HOME[session.role] : undefined;
    if (!home || request.nextUrl.searchParams.has("ended")) return NextResponse.next();
    return NextResponse.redirect(new URL(home, request.url));
  }

  if (!session) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  // Wrong area for this role: go to the user's own area.
  if (isAdmin) {
    if (session.role !== "admin" && session.role !== "superadmin") {
      return NextResponse.redirect(new URL(HOME[session.role] ?? LOGIN_PATH, request.url));
    }
    return NextResponse.next();
  }

  if (session.role !== "candidate") {
    return NextResponse.redirect(new URL(HOME[session.role] ?? LOGIN_PATH, request.url));
  }
  if (session.isBlocked) {
    return NextResponse.redirect(new URL(EXPIRED_PATH, request.url));
  }
  if (session.accessExpiresAt && new Date(session.accessExpiresAt) <= new Date()) {
    return NextResponse.redirect(new URL(EXPIRED_PATH, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/admin/:path*", "/dashboard/:path*"],
};
