"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { MEDIA_PAGE_PATH, deleteQuietly, validateAltText, type MediaUploadState } from "@/lib/media/upload";
import { cleanLine } from "@/lib/text";

// Editing and deleting pictures; uploading goes through POST /api/media/upload (it needs a larger request).
export type MediaActionState = MediaUploadState;

const NOT_FOUND = "This picture no longer exists.";

export async function updateAltText(_prevState: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const session = await requireRole(CONTENT_EDITORS);

  const mediaId = String(formData.get("mediaId") ?? "");
  const altText = cleanLine(formData.get("altText"));
  const altError = validateAltText(altText);
  if (altError) return { error: altError };

  let result: MediaActionState;
  try {
    result = await withTransaction<MediaActionState>(async (client) => {
      const { rows } = await client.query<{ alt_text: string; original_name: string }>(
        `select alt_text, original_name from media where id = $1 for update`,
        [mediaId]
      );
      if (!rows[0]) return { error: NOT_FOUND };
      if (rows[0].alt_text === altText) return { success: true };

      await client.query(`update media set alt_text = $2, updated_at = now() where id = $1`, [mediaId, altText]);
      await logActivity(
        client,
        session,
        "media.alt_text_changed",
        { type: "media", id: mediaId, label: rows[0].original_name },
        { from: rows[0].alt_text, to: altText }
      );
      return { success: true };
    });
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath(MEDIA_PAGE_PATH);
  return result;
}

export async function deleteMedia(_prevState: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const session = await requireRole(CONTENT_EDITORS);

  const mediaId = String(formData.get("mediaId") ?? "");
  if (!mediaId) return { error: NOT_FOUND };

  let paths: string[];
  try {
    // Pages, questions and category covers reference media with ON DELETE RESTRICT, so an in-use picture fails here.
    const deleted = await withTransaction(async (client) => {
      const { rows } = await client.query<{ storage_path: string; thumb_path: string; original_name: string }>(
        `delete from media where id = $1 returning storage_path, thumb_path, original_name`,
        [mediaId]
      );
      if (rows[0]) {
        await logActivity(client, session, "media.deleted", { type: "media", id: mediaId, label: rows[0].original_name });
      }
      return rows[0];
    });
    if (!deleted) return { error: "This picture has already been deleted." };
    paths = [deleted.storage_path, deleted.thumb_path];
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02") return { error: NOT_FOUND };
    if (code === "23503") {
      return { error: "This picture is used in the Handbook, the question bank or as a Handbook cover. Remove it from there first." };
    }
    throw error;
  }

  // The row is gone either way; a leftover file is harmless and is only reported.
  await deleteQuietly(paths);
  revalidatePath(MEDIA_PAGE_PATH);
  return { success: true };
}
