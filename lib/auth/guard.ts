import { cache } from "react";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db/pool";
import { getSession } from "./session";
import { SESSION_ENDED_LOGIN } from "./constants";
import type { SessionPayload, UserRole } from "./jwt";

export const ACCESS_EXPIRED_PATH = "/access-expired";

type Account = {
  role: UserRole;
  email: string;
  is_blocked: boolean;
  access_expires_at: Date | null;
  session_version: number;
};

// One read per request, however many checks run while rendering it.
const loadAccount = cache(async (userId: string): Promise<Account | null> => {
  const { rows } = await pool.query<Account>(
    `select role, email, is_blocked, access_expires_at, session_version from users where id = $1`,
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

// The sign-in checked against the database: null when signed out, the account was deleted, or its
// password changed since this sign-in.
export async function getLiveSession(): Promise<{ session: SessionPayload; account: Account } | null> {
  const session = await getSession();
  if (!session) return null;
  const account = await loadAccount(session.sub);
  if (!account || account.session_version !== session.ver || account.role !== session.role) return null;
  return { session: { ...session, email: account.email }, account };
}

// Use in Server Components AND Server Actions — actions are callable endpoints, so they can't rely on
// the page having checked already. Checked live: blocking, expiry and password changes apply at once.
export async function requireRole(allowedRoles: UserRole[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  const live = await getLiveSession();
  if (!live) redirect(SESSION_ENDED_LOGIN);
  if (!allowedRoles.includes(live.account.role)) redirect("/login");
  if (!hasAccess(live.account)) redirect(ACCESS_EXPIRED_PATH);
  return live.session;
}
