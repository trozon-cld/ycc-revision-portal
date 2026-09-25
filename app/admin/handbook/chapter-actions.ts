"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import {
  lockHandbookStructure,
  normaliseTitle,
  validateTitle,
  type StructureActionState,
} from "@/lib/handbook/structure";

const DUPLICATE_TITLE = "A chapter with this title already exists.";
const NOT_FOUND = "This chapter no longer exists.";
const SECTION_NOT_FOUND = "The chosen section no longer exists.";
const PAGE_PATH = "/admin/handbook";

export async function createChapter(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const sectionId = String(formData.get("sectionId") ?? "");
  const title = normaliseTitle(formData.get("title"));
  const invalid = validateTitle(title, "Chapter");
  if (invalid) return { error: invalid };
  if (!sectionId) return { error: "Choose a section." };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);
      const sectionTitle = await sectionTitleOf(client, sectionId);
      if (!sectionTitle) return { error: SECTION_NOT_FOUND };
      if (await titleTaken(client, title, null)) return { error: DUPLICATE_TITLE };

      const { rows: created } = await client.query<{ id: string }>(
        `insert into chapters (section_id, position, title)
         select $1, coalesce(max(position), 0) + 1, $2 from chapters where section_id = $1
         returning id`,
        [sectionId, title]
      );
      await logActivity(
        client,
        session,
        "chapter.created",
        { type: "chapter", id: created[0].id, label: title },
        { section: sectionTitle }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "23505") return { error: DUPLICATE_TITLE };
    if (code === "22P02") return { error: SECTION_NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

export async function renameChapter(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const chapterId = String(formData.get("chapterId") ?? "");
  const title = normaliseTitle(formData.get("title"));
  const invalid = validateTitle(title, "Chapter");
  if (invalid) return { error: invalid };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      const { rows } = await client.query<{ title: string }>(
        `select title from chapters where id = $1 for update`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].title === title) return { success: true };
      if (await titleTaken(client, title, chapterId)) return { error: DUPLICATE_TITLE };

      await client.query(`update chapters set title = $2, updated_at = now() where id = $1`, [chapterId, title]);
      await logActivity(
        client,
        session,
        "chapter.renamed",
        { type: "chapter", id: chapterId, label: title },
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

// Moves within the chapter's own section; "Move to section" crosses sections.
export async function moveChapter(id: string, direction: "up" | "down"): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const chapterId = String(id ?? "");
  if (direction !== "up" && direction !== "down") return { error: "Unknown direction." };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);

      const { rows } = await client.query<{ section_id: string; position: number; title: string }>(
        `select section_id, position, title from chapters where id = $1`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };

      const { section_id: sectionId, position: from } = rows[0];
      const to = direction === "up" ? from - 1 : from + 1;
      const { rows: neighbours } = await client.query<{ id: string }>(
        `select id from chapters where section_id = $1 and position = $2`,
        [sectionId, to]
      );
      if (!neighbours[0]) {
        return {
          error:
            direction === "up"
              ? "This chapter is already first in its section."
              : "This chapter is already last in its section.",
        };
      }

      await client.query(
        `update chapters
         set position = case when id = $1 then $3::int else $4::int end, updated_at = now()
         where id in ($1, $2)`,
        [chapterId, neighbours[0].id, to, from]
      );
      await logActivity(
        client,
        session,
        "chapter.reordered",
        { type: "chapter", id: chapterId, label: rows[0].title },
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

export async function moveChapterToSection(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const chapterId = String(formData.get("chapterId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  if (!sectionId) return { error: "Choose a section." };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);

      const { rows } = await client.query<{ section_id: string; position: number; title: string }>(
        `select section_id, position, title from chapters where id = $1`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].section_id === sectionId) return { success: true };
      const newSection = await sectionTitleOf(client, sectionId);
      if (!newSection) return { error: SECTION_NOT_FOUND };
      const oldSection = await sectionTitleOf(client, rows[0].section_id);

      await client.query(
        `update chapters
         set section_id = $2,
             position = (select coalesce(max(position), 0) + 1 from chapters where section_id = $2),
             updated_at = now()
         where id = $1`,
        [chapterId, sectionId]
      );
      await closeGap(client, rows[0].section_id, rows[0].position);
      await logActivity(
        client,
        session,
        "chapter.section_changed",
        { type: "chapter", id: chapterId, label: rows[0].title },
        { from: oldSection ?? "", to: newSection }
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

export async function deleteChapter(
  _prevState: StructureActionState,
  formData: FormData
): Promise<StructureActionState> {
  const session = await requireRole(["superadmin"]);

  const chapterId = String(formData.get("chapterId") ?? "");
  if (!chapterId) return { error: NOT_FOUND };

  let result: StructureActionState;
  try {
    result = await withTransaction<StructureActionState>(async (client) => {
      await lockHandbookStructure(client);

      const { rows } = await client.query<{ section_id: string; position: number; title: string }>(
        `delete from chapters where id = $1 returning section_id, position, title`,
        [chapterId]
      );
      if (!rows[0]) return { error: "This chapter has already been deleted." };

      await closeGap(client, rows[0].section_id, rows[0].position);
      await logActivity(
        client,
        session,
        "chapter.deleted",
        { type: "chapter", id: chapterId, label: rows[0].title },
        { section: (await sectionTitleOf(client, rows[0].section_id)) ?? "" }
      );
      return { success: true };
    });
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02") return { error: NOT_FOUND };
    if (code === "23503") {
      return { error: "This chapter still has pages or questions. Remove them before deleting it." };
    }
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

async function closeGap(client: PoolClient, sectionId: string, removedPosition: number) {
  await client.query(
    `update chapters set position = position - 1, updated_at = now() where section_id = $1 and position > $2`,
    [sectionId, removedPosition]
  );
}

async function sectionTitleOf(client: PoolClient, sectionId: string): Promise<string | undefined> {
  const { rows } = await client.query<{ title: string }>(`select title from sections where id = $1`, [sectionId]);
  return rows[0]?.title;
}

async function titleTaken(client: PoolClient, title: string, exceptId: string | null) {
  const { rows } = await client.query(
    `select 1 from chapters where lower(title) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [title, exceptId]
  );
  return rows.length > 0;
}
