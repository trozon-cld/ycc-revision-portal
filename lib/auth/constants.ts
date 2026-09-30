import type { UserRole } from "./jwt";

export const AUTH_COOKIE_NAME = "ycc_session";

// A sign-in ends after `idle` seconds without use, and in any case `max` seconds after logging in.
// While in use it is renewed (see proxy.ts), never past `max`.
const HOUR = 60 * 60;
export const SESSION_LIMITS: Record<"candidate" | "staff", { idle: number; max: number }> = {
  candidate: { idle: 24 * HOUR, max: 5 * 24 * HOUR },
  staff: { idle: 8 * HOUR, max: 24 * HOUR },
};
export function sessionLimits(role: UserRole) {
  return role === "candidate" ? SESSION_LIMITS.candidate : SESSION_LIMITS.staff;
}
// Proxy renews a sign-in once it is this old, so it isn't re-signed on every request.
export const RENEW_AFTER_SECONDS = 15 * 60;

// Sent to /login when a sign-in is no longer valid (account deleted, password changed elsewhere),
// so Proxy shows the form instead of redirecting back.
export const SESSION_ENDED_LOGIN = "/login?ended=1";
