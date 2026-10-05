"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { CATEGORY_NAME_MAX_LENGTH } from "@/lib/limits";
import { cleanLine } from "@/lib/text";
import type { FormState } from "@/lib/forms";

export type GroupActionState = FormState;

const MAX_GROUPS = 20;
const DUPLICATE_NAME = "A group with this name already exists.";
const NOT_FOUND = "This group no longer exists.";

export async function createGroup(_prevState: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const session = await requireRole(["superadmin"]);

  const name = cleanLine(formData.get("name"));
  const invalid = validateName(name);
  if (invalid) return { error: invalid };

  let result: GroupActionState;
  try {
    result = await withTransaction<GroupActionState>(async (client) => {
      await lockGroupOrder(client);
      if (await nameTaken(client, name, null)) return { error: DUPLICATE_NAME };

      const { rows: counts } = await client.query<{ count: number }>(
        `select count(*)::int as count from category_groups`
      );
      if (counts[0].count >= MAX_GROUPS) return { error: `You can have up to ${MAX_GROUPS} groups.` };

      const { rows } = await client.query<{ id: string }>(
        `insert into category_groups (position, name)
         select coalesce(max(position), 0) + 1, $1 from category_groups
         returning id`,
        [name]
      );
      await logActivity(client, session, "category_group.created", {
        type: "category_group",
        id: rows[0].id,
        label: name,
      });
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "23505") return { error: DUPLICATE_NAME };
    throw error;
  }

  revalidateGroupPages();
  return result;
}

export async function renameGroup(_prevState: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const session = await requireRole(["superadmin"]);

  const groupId = String(formData.get("groupId") ?? "");
  const name = cleanLine(formData.get("name"));
  const invalid = validateName(name);
  if (invalid) return { error: invalid };

  let result: GroupActionState;
  try {
    result = await withTransaction<GroupActionState>(async (client) => {
      const { rows } = await client.query<{ name: string }>(
        `select name from category_groups where id = $1 for update`,
        [groupId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].name === name) return { success: true };
      if (await nameTaken(client, name, groupId)) return { error: DUPLICATE_NAME };

      await client.query(`update category_groups set name = $2, updated_at = now() where id = $1`, [groupId, name]);
      await logActivity(
        client,
        session,
        "category_group.renamed",
        { type: "category_group", id: groupId, label: name },
        { from: rows[0].name, to: name }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_NAME };
    if (code === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidateGroupPages();
  return result;
}

export async function moveGroup(id: string, direction: "up" | "down"): Promise<GroupActionState> {
  const session = await requireRole(["superadmin"]);

  const groupId = String(id ?? "");
  if (direction !== "up" && direction !== "down") return { error: "Unknown direction." };

  let result: GroupActionState;
  try {
    result = await withTransaction<GroupActionState>(async (client) => {
      await lockGroupOrder(client);

      const { rows } = await client.query<{ position: number; name: string }>(
        `select position, name from category_groups where id = $1`,
        [groupId]
      );
      if (!rows[0]) return { error: NOT_FOUND };

      const from = rows[0].position;
      const to = direction === "up" ? from - 1 : from + 1;
      const { rows: neighbours } = await client.query<{ id: string }>(
        `select id from category_groups where position = $1`,
        [to]
      );
      if (!neighbours[0]) {
        return { error: direction === "up" ? "This group is already first." : "This group is already last." };
      }

      await client.query(
        `update category_groups
         set position = case when id = $1 then $3::int else $4::int end, updated_at = now()
         where id in ($1, $2)`,
        [groupId, neighbours[0].id, to, from]
      );
      await logActivity(
        client,
        session,
        "category_group.reordered",
        { type: "category_group", id: groupId, label: rows[0].name },
        { from: `Position ${from}`, to: `Position ${to}` }
      );
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidateGroupPages();
  return result;
}

export async function deleteGroup(_prevState: GroupActionState, formData: FormData): Promise<GroupActionState> {
  const session = await requireRole(["superadmin"]);

  const groupId = String(formData.get("groupId") ?? "");
  if (!groupId) return { error: NOT_FOUND };

  let result: GroupActionState;
  try {
    result = await withTransaction<GroupActionState>(async (client) => {
      await lockGroupOrder(client);

      const { rows: counts } = await client.query<{ count: number }>(
        `select count(*)::int as count from categories where group_id = $1`,
        [groupId]
      );
      if (counts[0].count > 0) return { error: blockedMessage(counts[0].count) };

      const { rows } = await client.query<{ position: number; name: string }>(
        `delete from category_groups where id = $1 returning position, name`,
        [groupId]
      );
      if (!rows[0]) return { error: "This group has already been deleted." };

      await client.query(
        `update category_groups set position = position - 1, updated_at = now() where position > $1`,
        [rows[0].position]
      );
      await logActivity(client, session, "category_group.deleted", {
        type: "category_group",
        id: groupId,
        label: rows[0].name,
      });
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02") return { error: NOT_FOUND };
    if (code === "23503") return { error: blockedMessage(1) };
    throw error;
  }

  revalidateGroupPages();
  return result;
}

// Serialises changes to group order; reads are not blocked.
async function lockGroupOrder(client: PoolClient) {
  await client.query(`lock table category_groups in share row exclusive mode`);
}

async function nameTaken(client: PoolClient, name: string, exceptId: string | null) {
  const { rows } = await client.query(
    `select 1 from category_groups where lower(name) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [name, exceptId]
  );
  return rows.length > 0;
}

function validateName(name: string): string | null {
  if (!name) return "Group name is required.";
  if (name.length > CATEGORY_NAME_MAX_LENGTH) return `Group name must be ${CATEGORY_NAME_MAX_LENGTH} characters or fewer.`;
  return null;
}

function blockedMessage(categoryCount: number) {
  return `This group still has ${categoryCount} categor${
    categoryCount === 1 ? "y" : "ies"
  }. Move or delete them before deleting the group.`;
}

function revalidateGroupPages() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/candidates");
}
