import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/jwt";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";

// Claims-based guard: role/block/expiry come from the JWT, no DB call.
// Next 16's Proxy can run Node code now, so a live check is possible later.

const ADMIN_PREFIX = "/admin";
const CANDIDATE_PREFIX = "/dashboard";
const LOGIN_PATH = "/login";
const EXPIRED_PATH = "/access-expired";

export async function proxy(request: NextRequest) {
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
