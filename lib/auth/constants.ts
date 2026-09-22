export const AUTH_COOKIE_NAME = "ycc_session";

// How long a session stays valid. Keep the JWT expiry and the cookie's
// maxAge in sync (see jwt.ts and cookies.ts).
export const SESSION_DURATION = "7d";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
