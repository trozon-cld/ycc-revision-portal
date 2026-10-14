import type { Pool, PoolClient } from "pg";
import { logAuthEvent } from "@/lib/audit/log";

// Login limits, counted from recent failures in auth_events (servers may keep no memory between requests):
// a 15-minute pause per email from one address (so others can't lock you out) and per address.
export const LOGIN_LIMITS = { perEmailAndAddress: 5, perAddress: 30, pauseMinutes: 15 };

const PAUSE_MS = LOGIN_LIMITS.pauseMinutes * 60 * 1000;

// Seconds until logins are allowed again, or 0 when not paused.
export async function loginPause(db: Pool | PoolClient, email: string, ip: string | null): Promise<number> {
  const address = ip === null ? "ip_address is null" : "ip_address = $1";
  const addressValues = ip === null ? [] : [ip];
  const [{ rows: pair }, { rows: all }] = await Promise.all([
    db.query<{ created_at: Date }>(
      `select created_at from auth_events
       where event = 'login_failed' and email = $${addressValues.length + 1} and ${address}
         and created_at > now() - interval '${2 * LOGIN_LIMITS.pauseMinutes} minutes'
       order by created_at desc limit ${LOGIN_LIMITS.perEmailAndAddress}`,
      [...addressValues, email]
    ),
    db.query<{ created_at: Date }>(
      `select created_at from auth_events
       where event = 'login_failed' and ${address}
         and created_at > now() - interval '${2 * LOGIN_LIMITS.pauseMinutes} minutes'
       order by created_at desc limit ${LOGIN_LIMITS.perAddress}`,
      addressValues
    ),
  ]);
  return Math.max(pausedFor(pair, LOGIN_LIMITS.perEmailAndAddress), pausedFor(all, LOGIN_LIMITS.perAddress));
}

// Paused when the last `limit` failures all fall within the window, until the window has passed
// since the most recent one.
function pausedFor(rows: { created_at: Date }[], limit: number): number {
  if (rows.length < limit) return 0;
  const newest = rows[0].created_at.getTime();
  const oldest = rows[limit - 1].created_at.getTime();
  if (newest - oldest > PAUSE_MS) return 0;
  return Math.max(0, Math.ceil((newest + PAUSE_MS - Date.now()) / 1000));
}

export function pausedMessage(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many login attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
}

// Site-wide: when this many logins fail across everyone within the window (many addresses at once), every login
// pauses for the window, refused before the password check and not recorded. One record marks the pause.
export const SITE_WIDE_LIMITS = { failures: 300, pauseMinutes: 15 };
export const SITE_WIDE_EMAIL = "All logins (site-wide pause)";
export const SITE_WIDE_MESSAGE = "Too many login attempts right now. Please try again in a few minutes.";

// Seconds until logins are allowed again everywhere, or 0. Starts the pause when the limit has just been reached.
export async function siteWidePause(db: Pool | PoolClient): Promise<number> {
  const window = `interval '${SITE_WIDE_LIMITS.pauseMinutes} minutes'`;
  const { rows: marker } = await db.query<{ created_at: Date }>(
    `select created_at from auth_events where event = 'login_paused' and email = $1 and created_at > now() - ${window}
     order by created_at desc limit 1`,
    [SITE_WIDE_EMAIL]
  );
  if (marker[0]) return Math.max(1, Math.ceil((marker[0].created_at.getTime() + SITE_WIDE_LIMITS.pauseMinutes * 60_000 - Date.now()) / 1000));
  const { rows } = await db.query<{ failures: number }>(
    `select count(*)::int as failures from (
       select 1 from auth_events where event = 'login_failed' and created_at > now() - ${window} limit ${SITE_WIDE_LIMITS.failures}
     ) recent`
  );
  if (rows[0].failures < SITE_WIDE_LIMITS.failures) return 0;
  await logAuthEvent(db, "login_paused", { id: null, email: SITE_WIDE_EMAIL, role: null }, null);
  return SITE_WIDE_LIMITS.pauseMinutes * 60;
}

// Records kept per account, so one person repeating log in / log out can't grow the login records without end.
// Logging in and out still work; only the extra records are skipped.
export const RECORD_LIMITS = { loginsPerWindow: 20, loginWindowMinutes: 15, logoutGapSeconds: 60 };

export async function shouldRecordLogin(db: Pool | PoolClient, userId: string): Promise<boolean> {
  const { rows } = await db.query<{ recent: number }>(
    `select count(*)::int as recent from (
       select 1 from auth_events where user_id = $1 and event = 'login_success'
         and created_at > now() - interval '${RECORD_LIMITS.loginWindowMinutes} minutes' limit ${RECORD_LIMITS.loginsPerWindow}
     ) recent`,
    [userId]
  );
  return rows[0].recent < RECORD_LIMITS.loginsPerWindow;
}

export async function shouldRecordLogout(db: Pool | PoolClient, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    `select 1 from auth_events where user_id = $1 and event = 'logout' and created_at > now() - interval '${RECORD_LIMITS.logoutGapSeconds} seconds' limit 1`,
    [userId]
  );
  return rows.length === 0;
}

