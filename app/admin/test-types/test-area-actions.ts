"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { TEST_TYPE_NAME_MAX_LENGTH } from "@/lib/limits";
import { cleanLine } from "@/lib/text";
import type { FormState } from "@/lib/forms";

export type TestAreaActionState = FormState;

const MAX_TEST_AREAS = 20;
const DUPLICATE_NAME = "A group with this name already exists.";
const NOT_FOUND = "This group no longer exists.";

export async function createTestArea(_prevState: TestAreaActionState, formData: FormData): Promise<TestAreaActionState> {
  const session = await requireRole(["superadmin"]);

  const name = cleanLine(formData.get("name"));
  const invalid = validateName(name);
  if (invalid) return { error: invalid };

  let result: TestAreaActionState;
  try {
    result = await withTransaction<TestAreaActionState>(async (client) => {
      await lockTestAreaOrder(client);
      if (await nameTaken(client, name, null)) return { error: DUPLICATE_NAME };

      const { rows: counts } = await client.query<{ count: number }>(
        `select count(*)::int as count from test_areas`
      );
      if (counts[0].count >= MAX_TEST_AREAS) return { error: `You can have up to ${MAX_TEST_AREAS} groups.` };

      const { rows } = await client.query<{ id: string }>(
        `insert into test_areas (position, name)
         select coalesce(max(position), 0) + 1, $1 from test_areas
         returning id`,
        [name]
      );
      await logActivity(client, session, "test_area.created", {
        type: "test_area",
        id: rows[0].id,
        label: name,
      });
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "23505") return { error: DUPLICATE_NAME };
    throw error;
  }

  revalidateTestAreaPages();
  return result;
}

export async function renameTestArea(_prevState: TestAreaActionState, formData: FormData): Promise<TestAreaActionState> {
  const session = await requireRole(["superadmin"]);

  const testAreaId = String(formData.get("testAreaId") ?? "");
  const name = cleanLine(formData.get("name"));
  const invalid = validateName(name);
  if (invalid) return { error: invalid };

  let result: TestAreaActionState;
  try {
    result = await withTransaction<TestAreaActionState>(async (client) => {
      const { rows } = await client.query<{ name: string }>(
        `select name from test_areas where id = $1 for update`,
        [testAreaId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].name === name) return { success: true };
      if (await nameTaken(client, name, testAreaId)) return { error: DUPLICATE_NAME };

      await client.query(`update test_areas set name = $2, updated_at = now() where id = $1`, [testAreaId, name]);
      await logActivity(
        client,
        session,
        "test_area.renamed",
        { type: "test_area", id: testAreaId, label: name },
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

  revalidateTestAreaPages();
  return result;
}

export async function moveTestArea(id: string, direction: "up" | "down"): Promise<TestAreaActionState> {
  const session = await requireRole(["superadmin"]);

  const testAreaId = String(id ?? "");
  if (direction !== "up" && direction !== "down") return { error: "Unknown direction." };

  let result: TestAreaActionState;
  try {
    result = await withTransaction<TestAreaActionState>(async (client) => {
      await lockTestAreaOrder(client);

      const { rows } = await client.query<{ position: number; name: string }>(
        `select position, name from test_areas where id = $1`,
        [testAreaId]
      );
      if (!rows[0]) return { error: NOT_FOUND };

      const from = rows[0].position;
      const to = direction === "up" ? from - 1 : from + 1;
      const { rows: neighbours } = await client.query<{ id: string }>(
        `select id from test_areas where position = $1`,
        [to]
      );
      if (!neighbours[0]) {
        return { error: direction === "up" ? "This group is already first." : "This group is already last." };
      }

      await client.query(
        `update test_areas
         set position = case when id = $1 then $3::int else $4::int end, updated_at = now()
         where id in ($1, $2)`,
        [testAreaId, neighbours[0].id, to, from]
      );
      await logActivity(
        client,
        session,
        "test_area.reordered",
        { type: "test_area", id: testAreaId, label: rows[0].name },
        { from: `Position ${from}`, to: `Position ${to}` }
      );
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidateTestAreaPages();
  return result;
}

export async function deleteTestArea(_prevState: TestAreaActionState, formData: FormData): Promise<TestAreaActionState> {
  const session = await requireRole(["superadmin"]);

  const testAreaId = String(formData.get("testAreaId") ?? "");
  if (!testAreaId) return { error: NOT_FOUND };

  let result: TestAreaActionState;
  try {
    result = await withTransaction<TestAreaActionState>(async (client) => {
      await lockTestAreaOrder(client);

      const { rows: counts } = await client.query<{ count: number }>(
        `select count(*)::int as count from test_types where test_area_id = $1`,
        [testAreaId]
      );
      if (counts[0].count > 0) return { error: blockedMessage(counts[0].count) };

      const { rows } = await client.query<{ position: number; name: string }>(
        `delete from test_areas where id = $1 returning position, name`,
        [testAreaId]
      );
      if (!rows[0]) return { error: "This group has already been deleted." };

      await client.query(
        `update test_areas set position = position - 1, updated_at = now() where position > $1`,
        [rows[0].position]
      );
      await logActivity(client, session, "test_area.deleted", {
        type: "test_area",
        id: testAreaId,
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

  revalidateTestAreaPages();
  return result;
}

// Serialises changes to test area order; reads are not blocked.
async function lockTestAreaOrder(client: PoolClient) {
  await client.query(`lock table test_areas in share row exclusive mode`);
}

async function nameTaken(client: PoolClient, name: string, exceptId: string | null) {
  const { rows } = await client.query(
    `select 1 from test_areas where lower(name) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [name, exceptId]
  );
  return rows.length > 0;
}

function validateName(name: string): string | null {
  if (!name) return "Group name is required.";
  if (name.length > TEST_TYPE_NAME_MAX_LENGTH) return `Group name must be ${TEST_TYPE_NAME_MAX_LENGTH} characters or fewer.`;
  return null;
}

function blockedMessage(testTypeCount: number) {
  return `This group still has ${testTypeCount} categor${
    testTypeCount === 1 ? "y" : "ies"
  }. Move or delete them before deleting the group.`;
}

function revalidateTestAreaPages() {
  revalidatePath("/admin/test-types");
  revalidatePath("/admin/candidates");
}
