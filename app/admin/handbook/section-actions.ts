"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import {
  MAX_SECTIONS,
  lockHandbookStructure,
  normaliseTitle,
  validateTitle,
  type StructureActionState,
} from "@/lib/handbook/structure";

const DUPLICATE_TITLE = "A section with this title already exists.";
const NOT_FOUND = "This section no longer exists.";
const PAGE_PATH = "/admin/handbook";

export async function createSection(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const title = normaliseTitle(formData.get("title"));
  const invalid = validateTitle(title, "Section");
  if (invalid) return { error: invalid };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);
      if (await titleTaken(client, title, null)) return { error: DUPLICATE_TITLE };

      const { rows } = await client.query<{ count: number }>(`select count(*)::int as count from sections`);
      if (rows[0].count >= MAX_SECTIONS) return { error: `The Handbook can have up to ${MAX_SECTIONS} sections (A–Z).` };

      const { rows: created } = await client.query<{ id: string }>(
        `insert into sections (position, title) select coalesce(max(position), 0) + 1, $1 from sections
         returning id`,
        [title]
      );
      await logActivity(client, session, "section.created", { type: "section", id: created[0].id, label: title });
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "23505") return { error: DUPLICATE_TITLE };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

export async function renameSection(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const sectionId = String(formData.get("sectionId") ?? "");
  const title = normaliseTitle(formData.get("title"));
  const invalid = validateTitle(title, "Section");
  if (invalid) return { error: invalid };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      const { rows } = await client.query<{ title: string }>(
        `select title from sections where id = $1 for update`,
        [sectionId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].title === title) return { success: true };
      if (await titleTaken(client, title, sectionId)) return { error: DUPLICATE_TITLE };

      await client.query(`update sections set title = $2, updated_at = now() where id = $1`, [sectionId, title]);
      await logActivity(
        client,
        session,
        "section.renamed",
        { type: "section", id: sectionId, label: title },
        { from: rows[0].title, to: title }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_TITLE };
    if (code === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

export async function moveSection(id: string, direction: "up" | "down"): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const sectionId = String(id ?? "");
  if (direction !== "up" && direction !== "down") return { error: "Unknown direction." };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);

      const { rows } = await client.query<{ position: number; title: string }>(
        `select position, title from sections where id = $1`,
        [sectionId]
      );
      if (!rows[0]) return { error: NOT_FOUND };

      const from = rows[0].position;
      const to = direction === "up" ? from - 1 : from + 1;
      const { rows: neighbours } = await client.query<{ id: string }>(`select id from sections where position = $1`, [
        to,
      ]);
      if (!neighbours[0]) {
        return { error: direction === "up" ? "This section is already first." : "This section is already last." };
      }

      await client.query(
        `update sections
         set position = case when id = $1 then $3::int else $4::int end, updated_at = now()
         where id in ($1, $2)`,
        [sectionId, neighbours[0].id, to, from]
      );
      await logActivity(
        client,
        session,
        "section.reordered",
        { type: "section", id: sectionId, label: rows[0].title },
        { from: `Position ${from}`, to: `Position ${to}` }
      );
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

export async function deleteSection(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const sectionId = String(formData.get("sectionId") ?? "");
  if (!sectionId) return { error: NOT_FOUND };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);

      const { rows: counts } = await client.query<{ count: number }>(
        `select count(*)::int as count from chapters where section_id = $1`,
        [sectionId]
      );
      if (counts[0].count > 0) return { error: blockedMessage(counts[0].count) };

      const { rows } = await client.query<{ position: number; title: string }>(
        `delete from sections where id = $1 returning position, title`,
        [sectionId]
      );
      if (!rows[0]) return { error: "This section has already been deleted." };

      await client.query(`update sections set position = position - 1, updated_at = now() where position > $1`, [
        rows[0].position,
      ]);
      await logActivity(client, session, "section.deleted", { type: "section", id: sectionId, label: rows[0].title });
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02") return { error: NOT_FOUND };
    if (code === "23503") return { error: blockedMessage(1) };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

async function titleTaken(client: PoolClient, title: string, exceptId: string | null) {
  const { rows } = await client.query(
    `select 1 from sections where lower(title) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [title, exceptId]
  );
  return rows.length > 0;
}

function blockedMessage(chapterCount: number) {
  return `This section still has ${chapterCount} chapter${
    chapterCount === 1 ? "" : "s"
  }. Move or delete them before deleting the section.`;
}
