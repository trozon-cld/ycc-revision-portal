import type { Pool, PoolClient } from "pg";
import { pool } from "@/lib/db/pool";
import { formatUkDateTime } from "@/lib/candidates/access";

// The structure lock (0040): while on, sections, chapters and which chapters each test type has can't change.

export const STRUCTURE_LOCKED = "The structure is locked. Unlock it at the top of the Handbook page first.";

export type StructureLock = { locked: boolean; changedBy: string | null; changedAt: string | null };

export async function readStructureLock(db: Pool | PoolClient = pool): Promise<StructureLock> {
  const { rows } = await db.query<{ locked: boolean; changed_by: string | null; changed_at: Date | null }>(
    `select l.locked, u.email as changed_by, l.changed_at from structure_lock l left join users u on u.id = l.changed_by`
  );
  const row = rows[0];
  return { locked: row?.locked ?? false, changedBy: row?.changed_by ?? null, changedAt: row?.changed_at?.toISOString() ?? null };
}

// Inside a structure change's transaction: holds the lock still until it commits; the refusal message if locked.
export async function structureLockedError(client: PoolClient): Promise<string | null> {
  const { rows } = await client.query<{ locked: boolean }>(`select locked from structure_lock for share`);
  return rows[0]?.locked ? STRUCTURE_LOCKED : null;
}

// For the lock bar: on or off, and who changed it when ("Locked by … on 30 Oct 2026, 15:10.").
export type StructureLockView = { locked: boolean; changed: string | null };

export async function loadStructureLockView(): Promise<StructureLockView> {
  const lock = await readStructureLock();
  const by = lock.changedBy ?? "a removed account";
  return {
    locked: lock.locked,
    changed: lock.changedAt ? `${lock.locked ? "Locked" : "Unlocked"} by ${by} on ${formatUkDateTime(lock.changedAt)}.` : null,
  };
}
