import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { sessionLimits } from "./constants";

export type UserRole = "superadmin" | "admin" | "candidate";

// What a sign-in carries. Blocking, expiry and password changes are checked live against the
// database on every page and action (lib/auth/guard.ts), not trusted from here.
export interface SessionPayload extends JWTPayload {
  sub: string; // users.id
  email: string;
  role: UserRole;
  // users.session_version at sign-in; a password change raises it and ends older sign-ins.
  ver: number;
  // Seconds since epoch when the user logged in; renewals never go past loginAt + max.
  loginAt: number;
}

export type SessionClaims = Pick<SessionPayload, "sub" | "email" | "role" | "ver" | "loginAt">;

const ALG = "HS256";

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

// Expiry: the idle limit from now, but never past the absolute limit from login.
export function sessionExpiry(claims: Pick<SessionClaims, "role" | "loginAt">, now = Math.floor(Date.now() / 1000)) {
  const { idle, max } = sessionLimits(claims.role);
  return Math.min(now + idle, claims.loginAt + max);
}

export async function signToken(claims: SessionClaims): Promise<{ token: string; maxAge: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = sessionExpiry(claims, now);
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecretKey());
  return { token, maxAge: Math.max(0, exp - now) };
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const session = payload as SessionPayload;
    // Sign-ins from before live checks (no version) are treated as signed out.
    if (typeof session.ver !== "number" || typeof session.loginAt !== "number") return null;
    return session;
  } catch {
    // Expired, tampered, or malformed — treat as "no session" everywhere.
    return null;
  }
}
