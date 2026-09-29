export const AUTH_COOKIE_NAME = "ycc_session";

// Keep these two in sync — the JWT expiry and the cookie's maxAge.
export const SESSION_DURATION = "7d";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

// Sent to /login when a signed-in account no longer exists, so Proxy shows the form instead of redirecting back.
export const SESSION_ENDED_LOGIN = "/login?ended=1";
