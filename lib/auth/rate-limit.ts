import type { Pool, PoolClient } from "pg";

// Login rate limiting, counted from recent failed logins in auth_events (Vercel keeps no memory
// between requests). Too many failures pause logins for 15 minutes after the last one:
// per email from one address (so others can't lock you out from elsewhere), and per address.
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
  return `Too many sign-in attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`;
}
