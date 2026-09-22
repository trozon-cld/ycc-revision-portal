import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";

// Day 1: claims-based guard. Role, block status, and candidate expiry are
// all read from the JWT itself — no DB call here (see lib/db/pool.ts's note
// on why `pg` can't run in Middleware's Edge runtime). Trade-off: an Admin
// blocking a candidate or an expiry passing takes effect on that
// candidate's next login, not mid-session. Flagged for revisit later.

const ADMIN_PREFIX = "/admin";
const CANDIDATE_PREFIX = "/dashboard";
const LOGIN_PATH = "/login";
const EXPIRED_PATH = "/access-expired";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  if (pathname.startsWith(ADMIN_PREFIX)) {
    if (session.role !== "admin" && session.role !== "superadmin") {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith(CANDIDATE_PREFIX)) {
    if (session.role !== "candidate") {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }
    if (session.isBlocked) {
      return NextResponse.redirect(new URL(EXPIRED_PATH, request.url));
    }
    if (
      session.accessExpiresAt &&
      new Date(session.accessExpiresAt) <= new Date()
    ) {
      return NextResponse.redirect(new URL(EXPIRED_PATH, request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};
