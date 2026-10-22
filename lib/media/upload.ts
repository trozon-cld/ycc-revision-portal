import { revalidatePath } from "next/cache";
import type { SessionPayload } from "@/lib/auth/jwt";
import { withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { EXTENSION_BY_MIME, readImageInfo, type ImageInfo } from "@/lib/media/image-info";
import { storedBytes } from "@/lib/storage/usage";
import { MAX_THUMB_BYTES, MAX_UPLOAD_BYTES, STORAGE_LIMIT_BYTES } from "@/lib/media/limits";
import { StorageConfigError, deleteObjects, storeObject } from "@/lib/storage/storage";
import { ALT_TEXT_MAX_LENGTH } from "@/lib/limits";
import { cleanLine } from "@/lib/text";
import type { FormState } from "@/lib/forms";

// Server-only: saving an uploaded picture (POST /api/media/upload) and the checks the media actions share.

// After an upload, the new picture's id (so the picker can select it).
export type MediaUploadState = FormState & { mediaId?: string };

const MAX_NAME_LENGTH = 255;
export const MEDIA_PAGE_PATH = "/admin/media";
export const NOT_CONFIGURED = "Image storage isn't set up yet. Add the Supabase settings to the server's environment.";
export const STORAGE_FULL = "Picture storage is full. Delete pictures you no longer use in Media, then try again.";

export async function saveUpload(session: SessionPayload, formData: FormData): Promise<MediaUploadState> {
  const altText = cleanLine(formData.get("altText"));
  const altError = validateAltText(altText);
  if (altError) return { error: altError };

  const originalName = cleanLine(formData.get("originalName")).slice(0, MAX_NAME_LENGTH) || "picture";
  const main = await readUpload(formData.get("file"), MAX_UPLOAD_BYTES);
  if ("error" in main) return { error: main.error };
  const thumb = await readUpload(formData.get("thumb"), MAX_THUMB_BYTES);
  if ("error" in thumb) return { error: "The preview image couldn't be prepared. Please choose the picture again." };
  if ((await storedBytes()) + main.file.size + thumb.file.size > STORAGE_LIMIT_BYTES) return { error: STORAGE_FULL };

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
    await withTransaction(async (client) => {
      await client.query(
        `insert into media (id, storage_path, thumb_path, original_name, mime_type, width, height, byte_size, alt_text, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [id, storagePath, thumbPath, originalName, main.info.mime, main.info.width, main.info.height, main.file.size, altText, session.sub]
      );
      await logActivity(client, session, "media.uploaded", { type: "media", id, label: originalName });
    });
  } catch (error) {
    await deleteQuietly([storagePath, thumbPath]);
    throw error;
  }

  revalidatePath(MEDIA_PAGE_PATH);
  return { success: true, mediaId: id };
}

type ReadUpload = { file: File; info: ImageInfo } | { error: string };

async function readUpload(value: FormDataEntryValue | null, maxBytes: number): Promise<ReadUpload> {
  if (!(value instanceof File) || value.size === 0) return { error: "Choose a picture to upload." };
  if (value.size > maxBytes) return { error: `The picture must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.` };

  const info = readImageInfo(new Uint8Array(await value.arrayBuffer()));
  if (!info) return { error: "Only PNG, JPEG and WebP pictures can be uploaded." };
  return { file: value, info };
}

export async function deleteQuietly(paths: string[]) {
  try {
    await deleteObjects(paths);
  } catch (error) {
    if (!(error instanceof StorageConfigError)) console.error("Media file cleanup failed", paths, error);
  }
}

export function validateAltText(altText: string): string | null {
  if (!altText) return "Describe what the picture shows.";
  if (altText.length > ALT_TEXT_MAX_LENGTH) return `The description must be ${ALT_TEXT_MAX_LENGTH} characters or fewer.`;
  return null;
}
