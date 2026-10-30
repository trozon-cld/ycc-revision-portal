import { revalidatePath } from "next/cache";
import type { SessionPayload } from "@/lib/auth/jwt";
import { logActivity } from "@/lib/audit/log";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { MEDIA_PAGE_PATH, deleteQuietly, readPreparedUpload, storePictureFiles, validateAltText } from "@/lib/media/upload";
import { cleanLine } from "@/lib/text";
import { pool } from "@/lib/db/pool";

// Server-only: one picture of a batch (POST /api/content/picture), by its batch file name. The same file again
// changes nothing; a new name adds a picture; a known name with a different file replaces it everywhere it's used.

export type PictureImportResult = { ok: true; mediaId: string; change: "new" | "update" | "same" } | { ok: false; error: string };

const MAX_NAME_LENGTH = 255;
const FROM_BATCH = { source: "From bulk upload" };

export async function importPicture(session: SessionPayload, formData: FormData): Promise<PictureImportResult> {
  const sourceName = cleanLine(formData.get("sourceName"));
  const sha256 = String(formData.get("sha256") ?? "");
  const altText = cleanLine(formData.get("altText"));
  if (!sourceName || sourceName.length > MAX_NAME_LENGTH) return { ok: false, error: "The picture's file name is missing or too long." };
  if (!/^[0-9a-f]{64}$/.test(sha256)) return { ok: false, error: "Something went wrong. Please try again." };
  const altError = validateAltText(altText);
  if (altError) return { ok: false, error: `${sourceName}: ${altError}` };

  // Already there with the same file: nothing to send or store.
  const { rows: found } = await pool.query<{ id: string; sha256: string | null }>(
    `select id, source_sha256 as sha256 from media where lower(source_name) = lower($1)`,
    [sourceName]
  );
  if (found[0]?.sha256 === sha256) return { ok: true, mediaId: found[0].id, change: "same" };

  const upload = await readPreparedUpload(formData);
  if ("error" in upload) return { ok: false, error: `${sourceName}: ${upload.error}` };
  const fileId = crypto.randomUUID();
  const stored = await storePictureFiles(fileId, upload);
  if ("error" in stored) return { ok: false, error: `${sourceName}: ${stored.error}` };

  let oldPaths: string[] = [];
  let result: PictureImportResult;
  try {
    result = await withTransaction<PictureImportResult>(async (client) => {
      const { rows } = await client.query<{ id: string; sha256: string | null; storage_path: string; thumb_path: string }>(
        `select id, source_sha256 as sha256, storage_path, thumb_path from media where lower(source_name) = lower($1) for update`,
        [sourceName]
      );
      const current = rows[0];
      if (current?.sha256 === sha256) return { ok: true, mediaId: current.id, change: "same" };
      const { main } = upload;
      if (!current) {
        await client.query(
          `insert into media (id, storage_path, thumb_path, original_name, mime_type, width, height, byte_size, alt_text, uploaded_by, source_name, source_sha256)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $4, $11)`,
          [fileId, stored.storagePath, stored.thumbPath, sourceName, main.info.mime, main.info.width, main.info.height, main.file.size, altText, session.sub, sha256]
        );
        await logActivity(client, session, "media.uploaded", { type: "media", id: fileId, label: sourceName }, FROM_BATCH);
        return { ok: true, mediaId: fileId, change: "new" };
      }
      await client.query(
        `update media set storage_path = $2, thumb_path = $3, mime_type = $4, width = $5, height = $6, byte_size = $7, alt_text = $8,
                          source_sha256 = $9, updated_at = now()
         where id = $1`,
        [current.id, stored.storagePath, stored.thumbPath, main.info.mime, main.info.width, main.info.height, main.file.size, altText, sha256]
      );
      await logActivity(client, session, "media.replaced", { type: "media", id: current.id, label: sourceName }, FROM_BATCH);
      oldPaths = [current.storage_path, current.thumb_path];
      return { ok: true, mediaId: current.id, change: "update" };
    });
  } catch (error) {
    await deleteQuietly([stored.storagePath, stored.thumbPath]);
    // Another upload added this name at the same moment.
    if (getErrorCode(error) === "23505") return { ok: false, error: `${sourceName} was uploaded at the same time elsewhere. Import again.` };
    throw error;
  }

  // The new files weren't needed (same file saved meanwhile), or the replaced ones are no longer used.
  if (result.ok && result.change === "same") await deleteQuietly([stored.storagePath, stored.thumbPath]);
  if (oldPaths.length > 0) await deleteQuietly(oldPaths);
  revalidatePath(MEDIA_PAGE_PATH);
  revalidatePath("/admin/handbook", "layout");
  return result;
}
