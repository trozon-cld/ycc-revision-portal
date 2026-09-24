"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import { pool } from "@/lib/db/pool";
import { EXTENSION_BY_MIME, readImageInfo, type ImageInfo } from "@/lib/media/image-info";
import { MAX_THUMB_BYTES, MAX_UPLOAD_BYTES } from "@/lib/media/limits";
import { StorageConfigError, deleteObjects, storeObject } from "@/lib/storage/storage";

// Activity logging for Handbook content is deferred to Handbook plan Phase F (ask first).

export type MediaActionState = { error?: string; success?: boolean };

const MAX_ALT_LENGTH = 300;
const MAX_NAME_LENGTH = 255;
const PAGE_PATH = "/admin/media";
const NOT_FOUND = "This picture no longer exists.";
const NOT_CONFIGURED = "Image storage isn't set up yet. Add the Supabase settings to the server's environment.";

export async function uploadMedia(_prevState: MediaActionState, formData: FormData): Promise<MediaActionState> {
  const session = await requireRole(["superadmin"]);

  const altText = normaliseText(formData.get("altText"));
  const altError = validateAltText(altText);
  if (altError) return { error: altError };

  const originalName = normaliseText(formData.get("originalName")).slice(0, MAX_NAME_LENGTH) || "picture";
  const main = await readUpload(formData.get("file"), MAX_UPLOAD_BYTES);
  if ("error" in main) return { error: main.error };
  const thumb = await readUpload(formData.get("thumb"), MAX_THUMB_BYTES);
  if ("error" in thumb) return { error: "The preview image couldn't be prepared. Please choose the picture again." };

  const id = crypto.randomUUID();
  const storagePath = `media/${id}.${EXTENSION_BY_MIME[main.info.mime]}`;
  const thumbPath = `media/${id}-thumb.${EXTENSION_BY_MIME[thumb.info.mime]}`;

  try {
    await storeObject(storagePath, main.file, main.info.mime);
    await storeObject(thumbPath, thumb.file, thumb.info.mime);
  } catch (error) {
    await deleteQuietly([storagePath, thumbPath]);
    if (error instanceof StorageConfigError) return { error: NOT_CONFIGURED };
    console.error("Media upload failed", error);
    return { error: "The picture couldn't be uploaded. Please try again." };
  }

  try {
    await pool.query(
      `insert into media (id, storage_path, thumb_path, original_name, mime_type, width, height, byte_size, alt_text, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        storagePath,
        thumbPath,
        originalName,
        main.info.mime,
        main.info.width,
        main.info.height,
        main.file.size,
        altText,
        session.sub,
      ]
    );
  } catch (error) {
    await deleteQuietly([storagePath, thumbPath]);
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return { success: true };
}

export async function updateAltText(_prevState: MediaActionState, formData: FormData): Promise<MediaActionState> {
  await requireRole(["superadmin"]);

  const mediaId = String(formData.get("mediaId") ?? "");
  const altText = normaliseText(formData.get("altText"));
  const altError = validateAltText(altText);
  if (altError) return { error: altError };

  try {
    const { rowCount } = await pool.query(
      `update media set alt_text = $2, updated_at = now() where id = $1 and alt_text is distinct from $2`,
      [mediaId, altText]
    );
    if (rowCount === 0) {
      const { rows } = await pool.query(`select 1 from media where id = $1`, [mediaId]);
      if (rows.length === 0) return { error: NOT_FOUND };
    }
  } catch (error) {
    if (getErrorCode(error) === "22P02") return { error: NOT_FOUND };
    throw error;
  }

  revalidatePath(PAGE_PATH);
  return { success: true };
}

export async function deleteMedia(_prevState: MediaActionState, formData: FormData): Promise<MediaActionState> {
  await requireRole(["superadmin"]);

  const mediaId = String(formData.get("mediaId") ?? "");
  if (!mediaId) return { error: NOT_FOUND };

  let paths: string[];
  try {
    // Pages and questions will reference media with ON DELETE RESTRICT, so an in-use picture fails here.
    const deleted = await withTransaction(async (client) => {
      const { rows } = await client.query<{ storage_path: string; thumb_path: string }>(
        `delete from media where id = $1 returning storage_path, thumb_path`,
        [mediaId]
      );
      return rows[0];
    });
    if (!deleted) return { error: "This picture has already been deleted." };
    paths = [deleted.storage_path, deleted.thumb_path];
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "22P02") return { error: NOT_FOUND };
    if (code === "23503") return { error: "This picture is used in the Handbook. Remove it from there first." };
    throw error;
  }

  // The row is gone either way; a leftover file is harmless and is only reported.
  await deleteQuietly(paths);
  revalidatePath(PAGE_PATH);
  return { success: true };
}

type ReadUpload = { file: File; info: ImageInfo } | { error: string };

async function readUpload(value: FormDataEntryValue | null, maxBytes: number): Promise<ReadUpload> {
  if (!(value instanceof File) || value.size === 0) return { error: "Choose a picture to upload." };
  if (value.size > maxBytes) return { error: `The picture must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.` };

  const info = readImageInfo(new Uint8Array(await value.arrayBuffer()));
  if (!info) return { error: "Only PNG, JPEG and WebP pictures can be uploaded." };
  return { file: value, info };
}

async function deleteQuietly(paths: string[]) {
  try {
    await deleteObjects(paths);
  } catch (error) {
    if (!(error instanceof StorageConfigError)) console.error("Media file cleanup failed", paths, error);
  }
}

function normaliseText(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function validateAltText(altText: string): string | null {
  if (!altText) return "Describe what the picture shows.";
  if (altText.length > MAX_ALT_LENGTH) return `The description must be ${MAX_ALT_LENGTH} characters or fewer.`;
  return null;
}
