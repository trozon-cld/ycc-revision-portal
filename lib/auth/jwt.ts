import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { SESSION_DURATION } from "./constants";

export type UserRole = "superadmin" | "admin" | "candidate";

// What we bake into the JWT at login (Day 1: claims-based session, no live
// DB check in Middleware — see project notes on the trade-off: a block or
// expiry change by an Admin takes effect on next login, not mid-session).
export interface SessionPayload extends JWTPayload {
  sub: string; // users.id
  email: string;
  role: UserRole;
  isBlocked: boolean;
  // ISO timestamp, candidates only. Admins/Superadmins carry null.
  accessExpiresAt: string | null;
}

const ALG = "HS256";

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(
  payload: Omit<SessionPayload, "iat" | "exp">
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecretKey());
}

export async function verifyToken(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as SessionPayload;
  } catch {
    // Expired, tampered, or malformed — treat as "no session" everywhere.
    return null;
  }
}
