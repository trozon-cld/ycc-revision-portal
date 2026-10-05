import type { Pool, PoolClient } from "pg";
import { headers } from "next/headers";
import type { SessionPayload, UserRole } from "@/lib/auth/jwt";
import type { ActivityAction, AuthEvent } from "./actions";

type TargetType =
  | "admin"
  | "candidate"
  | "category"
  | "category_group"
  | "section"
  | "chapter"
  | "page"
  | "question"
  | "media"
  | "account"
  | "log_archive";
type Details = Record<string, string>;

export function ipFromHeaders(requestHeaders: Headers): string | null {
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

// Call inside the same transaction as the change, so neither exists without the other.
// Actor email is read live because a session can carry an email changed since login.
export async function logActivity(
  client: PoolClient,
  actor: SessionPayload,
  action: ActivityAction,
  target: { type: TargetType; id: string | null; label: string },
  details: Details = {}
) {
  const ip = ipFromHeaders(await headers());
  await client.query(
    `insert into activity_logs
       (actor_id, actor_email, actor_role, action, target_type, target_id, target_label, details, ip_address)
     values ($1, coalesce((select email from users where id = $1), $2), $3, $4, $5, $6, $7, $8, $9)`,
    [actor.sub, actor.email, actor.role, action, target.type, target.id, target.label, JSON.stringify(details), ip]
  );
}

export async function logAuthEvent(
  db: Pool | PoolClient,
  event: AuthEvent,
  user: { id: string | null; email: string; role: UserRole | null },
  ip: string | null
) {
  await db.query(
    `insert into auth_events (event, user_id, email, role, ip_address) values ($1, $2, $3, $4, $5)`,
    [event, user.id, user.email.slice(0, 255), user.role, ip]
  );
}
