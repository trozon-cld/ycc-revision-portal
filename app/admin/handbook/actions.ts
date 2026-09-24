"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";

// Activity logging for Handbook content is deferred to Handbook plan Phase F (ask first).

export type ChapterActionState = { error?: string; success?: boolean };

const MAX_TITLE_LENGTH = 120;
const DUPLICATE_TITLE = "A chapter with this title already exists.";
const NOT_FOUND = "This chapter no longer exists.";
const PAGE_PATH = "/admin/handbook";

export async function createChapter(
  _prevState: ChapterActionState,
  formData: FormData
): Promise<ChapterActionState> {
  await requireRole(["superadmin"]);

  const title = normaliseTitle(formData.get("title"));
  const invalid = validateTitle(title);
  if (invalid) return { error: invalid };

  let result: ChapterActionState;
  try {
    result = await withTransaction<ChapterActionState>(async (client) => {
      await lockChapters(client);
      if (await titleTaken(client, title, null)) return { error: DUPLICATE_TITLE };

      await client.query(
        `insert into chapters (position, title)
         select coalesce(max(position), 0) + 1, $1 from chapters`,
        [title]
      );
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "23505") return { error: DUPLICATE_TITLE };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return result;
}

export async function renameChapter(
  _prevState: ChapterActionState,
  formData: FormData
): Promise<ChapterActionState> {
  await requireRole(["superadmin"]);

  const chapterId = String(formData.get("chapterId") ?? "");
  const title = normaliseTitle(formData.get("title"));
  const invalid = validateTitle(title);
  if (invalid) return { error: invalid };

  let result: ChapterActionState;
  try {
    result = await withTransaction<ChapterActionState>(async (client) => {
      const { rows } = await client.query<{ title: string }>(
        `select title from chapters where id = $1 for update`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].title === title) return { success: true };
      if (await titleTaken(client, title, chapterId)) return { error: DUPLICATE_TITLE };

      await client.query(`update chapters set title = $2, updated_at = now() where id = $1`, [
        chapterId,
        title,
      ]);
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

export async function moveChapter(id: string, direction: "up" | "down"): Promise<ChapterActionState> {
  await requireRole(["superadmin"]);

  const chapterId = String(id ?? "");
  if (direction !== "up" && direction !== "down") return { error: "Unknown direction." };

  let result: ChapterActionState;
  try {
    result = await withTransaction<ChapterActionState>(async (client) => {
      await lockChapters(client);

      const { rows } = await client.query<{ position: number }>(
        `select position from chapters where id = $1`,
        [chapterId]
      );
      if (!rows[0]) return { error: NOT_FOUND };

      const from = rows[0].position;
      const to = direction === "up" ? from - 1 : from + 1;
      const { rows: neighbours } = await client.query<{ id: string }>(
        `select id from chapters where position = $1`,
        [to]
      );
      if (!neighbours[0]) {
        return { error: direction === "up" ? "This chapter is already first." : "This chapter is already last." };
      }

      await client.query(
        `update chapters
         set position = case when id = $1 then $3::int else $4::int end, updated_at = now()
         where id in ($1, $2)`,
        [chapterId, neighbours[0].id, to, from]
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
  _prevState: ChapterActionState,
  formData: FormData
): Promise<ChapterActionState> {
  await requireRole(["superadmin"]);

  const chapterId = String(formData.get("chapterId") ?? "");
  if (!chapterId) return { error: NOT_FOUND };

  let result: ChapterActionState;
  try {
    result = await withTransaction<ChapterActionState>(async (client) => {
      await lockChapters(client);

      const { rows } = await client.query<{ position: number }>(
        `delete from chapters where id = $1 returning position`,
        [chapterId]
      );
      if (!rows[0]) return { error: "This chapter has already been deleted." };

      await client.query(
        `update chapters set position = position - 1, updated_at = now() where position > $1`,
        [rows[0].position]
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

// Serialises every change to chapter order; reads are not blocked.
async function lockChapters(client: PoolClient) {
  await client.query(`lock table chapters in share row exclusive mode`);
}

async function titleTaken(client: PoolClient, title: string, exceptId: string | null) {
  const { rows } = await client.query(
    `select 1 from chapters where lower(title) = lower($1) and ($2::uuid is null or id <> $2::uuid)`,
    [title, exceptId]
  );
  return rows.length > 0;
}

function normaliseTitle(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function validateTitle(title: string): string | null {
  if (!title) return "Chapter title is required.";
  if (title.length > MAX_TITLE_LENGTH) {
    return `Chapter title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }
  return null;
}
