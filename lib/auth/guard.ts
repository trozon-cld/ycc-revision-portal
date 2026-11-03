import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db/pool";
import { getSession } from "./session";
import { SESSION_ENDED_LOGIN } from "./constants";
import { OFFICE_ONLY_PATH, isOutsideOffice } from "./office-network";
import { ipFromHeaders } from "@/lib/audit/log";
import type { SessionPayload, UserRole } from "./jwt";

export const ACCESS_EXPIRED_PATH = "/access-expired";

type Account = {
  role: UserRole;
  email: string;
  is_blocked: boolean;
  access_expires_at: Date | null;
  session_version: number;
  office_exempt: boolean;
};

// One read per request, however many checks run while rendering it.
const loadAccount = cache(async (userId: string): Promise<Account | null> => {
  const { rows } = await pool.query<Account>(
    `select role, email, is_blocked, access_expires_at, session_version, office_exempt from users where id = $1`,
    [userId]
  );
  return rows[0] ?? null;
});

// Candidates only; Admins and the Superadmin never lose access this way.
export function hasAccess(account: Pick<Account, "role" | "is_blocked" | "access_expires_at">): boolean {
  if (account.role !== "candidate") return true;
  if (account.is_blocked) return false;
  return !account.access_expires_at || account.access_expires_at.getTime() > Date.now();
}

type LiveSession = { session: SessionPayload; account: Account };

// The sign-in checked against the database: null when signed out, the account was deleted, or its
// password changed since this sign-in.
async function loadLiveSession(): Promise<LiveSession | null> {
  const session = await getSession();
  if (!session) return null;
  const account = await loadAccount(session.sub);
  if (!account || account.session_version !== session.ver || account.role !== session.role) return null;
  return { session: { ...session, email: account.email }, account };
}

// An Admin outside the office network (when that check is on) can't use admin pages or actions from here.
export async function isOffNetwork(account: Account): Promise<boolean> {
  return isOutsideOffice(account, ipFromHeaders(await headers()));
}

// As loadLiveSession, and also null for an Admin outside the office network (route handlers treat it as signed out).
export async function getLiveSession(): Promise<LiveSession | null> {
  const live = await loadLiveSession();
  if (!live || (await isOffNetwork(live.account))) return null;
  return live;
}

// The sign-in as it stands, even outside the office network: for the logout route and the office-network-only page.
export const getSignedInAccount = loadLiveSession;

// Use in Server Components AND Server Actions — actions are callable endpoints, so they can't rely on
// the page having checked already. Checked live: blocking, expiry and password changes apply at once.
export async function requireRole(allowedRoles: readonly UserRole[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  const live = await loadLiveSession();
  if (!live) redirect(SESSION_ENDED_LOGIN);
  if (!allowedRoles.includes(live.account.role)) redirect("/login");
  if (!hasAccess(live.account)) redirect(ACCESS_EXPIRED_PATH);
  if (await isOffNetwork(live.account)) redirect(OFFICE_ONLY_PATH);
  return live.session;
}
