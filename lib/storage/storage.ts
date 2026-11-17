import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// The only file that knows the storage provider (Amazon S3). Server-only: never import it from a client component.
// Permission comes from AWS's usual chain: the host's role on AWS, or a dev-only access key on a developer's PC.

// Pictures, log archives, Handbook audio and database backups live in separate private buckets.
export type StorageArea = "media" | "archives" | "audio" | "backups";
const BUCKET_SETTINGS: Record<StorageArea, string> = {
  media: "S3_MEDIA_BUCKET",
  archives: "S3_ARCHIVE_BUCKET",
  audio: "S3_AUDIO_BUCKET",
  backups: "S3_BACKUP_BUCKET",
};
const REGION_SETTING = "S3_REGION";
// Tests and S3-compatible stores only; on AWS it stays unset.
const ENDPOINT_SETTING = "S3_ENDPOINT";
const IMMUTABLE_MAX_AGE = "max-age=31536000";
const DELETE_BATCH = 1000;
const CHECKS_AT_ONCE = 20;
// Above this many paths, listing the bucket (1,000 names a request) is quicker than asking about each file.
const LIST_FROM = 200;

export class StorageConfigError extends Error {}

// The storage settings by name, for "not set up" messages elsewhere (they change with the provider).
export const STORAGE_SETTINGS: readonly string[] = [REGION_SETTING, ...Object.values(BUCKET_SETTINGS)];
export const STORAGE_SETTINGS_TEXT = `${STORAGE_SETTINGS.slice(0, -1).join(", ")} and ${STORAGE_SETTINGS.at(-1)} to the server's environment`;

export function isStorageConfigured() {
  return STORAGE_SETTINGS.every((name) => Boolean(process.env[name]));
}

let cached: { key: string; client: S3Client } | null = null;

function config(area: StorageArea = "media") {
  const region = process.env[REGION_SETTING];
  const bucket = process.env[BUCKET_SETTINGS[area]];
  if (!region || !bucket) throw new StorageConfigError(`${STORAGE_SETTINGS.join(", ")} must be set to use storage.`);
  const endpoint = process.env[ENDPOINT_SETTING] || undefined;
  const key = `${region}|${endpoint ?? ""}`;
  if (cached?.key !== key) {
    cached = { key, client: new S3Client({ region, ...(endpoint ? { endpoint, forcePathStyle: true } : {}) }) };
  }
  return { client: cached.client, bucket };
}

function errorName(error: unknown) {
  return error instanceof S3ServiceException ? error.name : error instanceof Error ? error.name : "";
}

function status(error: unknown) {
  return error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined;
}

function storageError(error: unknown, bucket: string, action: string): Error {
  if (errorName(error) === "NoSuchBucket") return new StorageConfigError(`The storage bucket "${bucket}" doesn't exist yet.`);
  const detail = error instanceof Error ? error.message.slice(0, 300) : String(error);
  return new Error(`Storage ${action} failed (${status(error) ?? (errorName(error) || "error")}): ${detail}`);
}

// Paths are unique per upload, so objects are cached for a year and never overwritten (storage refuses; this throws).
// `replace`: fixed paths written again on a retry (log archives), not cached. `restore`: the same file at its own path.
export async function storeObject(
  path: string,
  body: Blob,
  contentType: string,
  { replace = false, restore = false, area = "media" }: { replace?: boolean; restore?: boolean; area?: StorageArea } = {}
): Promise<void> {
  const { client, bucket } = config(area);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: path,
        Body: new Uint8Array(await body.arrayBuffer()),
        ContentType: contentType,
        CacheControl: replace ? "no-cache" : IMMUTABLE_MAX_AGE,
        ...(replace || restore ? {} : { IfNoneMatch: "*" }),
      })
    );
  } catch (error) {
    throw storageError(error, bucket, "upload");
  }
}

export async function deleteObjects(paths: string[], area: StorageArea = "media"): Promise<void> {
  if (paths.length === 0) return;
  const { client, bucket } = config(area);
  for (let start = 0; start < paths.length; start += DELETE_BATCH) {
    const batch = paths.slice(start, start + DELETE_BATCH);
    let failed: string[] = [];
    try {
      const result = await client.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } })
      );
      failed = (result.Errors ?? []).map((item) => `${item.Key}: ${item.Code}`);
    } catch (error) {
      throw storageError(error, bucket, "delete");
    }
    if (failed.length > 0) throw new Error(`Storage delete failed for ${failed.length} file(s): ${failed.slice(0, 3).join("; ")}`);
  }
}

// Which of these objects are actually in storage. Signing a link doesn't check that, so ask storage.
export async function existingPaths(paths: string[], area: StorageArea = "media"): Promise<Set<string>> {
  const found = new Set<string>();
  if (paths.length === 0) return found;
  const { client, bucket } = config(area);
  const unique = [...new Set(paths)];
  if (unique.length > LIST_FROM) {
    const wanted = new Set(unique);
    let token: string | undefined;
    do {
      try {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
        for (const item of page.Contents ?? []) if (item.Key && wanted.has(item.Key)) found.add(item.Key);
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } catch (error) {
        throw storageError(error, bucket, "check");
      }
    } while (token);
    return found;
  }
  for (let start = 0; start < unique.length; start += CHECKS_AT_ONCE) {
    await Promise.all(
      unique.slice(start, start + CHECKS_AT_ONCE).map(async (path) => {
        try {
          await client.send(new HeadObjectCommand({ Bucket: bucket, Key: path }));
          found.add(path);
        } catch (error) {
          if (status(error) === 404) return;
          throw storageError(error, bucket, "check");
        }
      })
    );
  }
  return found;
}

function signedLink(client: S3Client, bucket: string, path: string, expiresInSeconds: number, fileName?: string) {
  const disposition = fileName
    ? `attachment; filename="${fileName.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    : undefined;
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: path, ResponseContentDisposition: disposition }), {
    expiresIn: expiresInSeconds,
  });
}

// Short-lived links to private objects. Signing happens on the server without asking storage, so a link is
// made for every path, found or not; use existingPaths when it matters whether the file is there.
export async function getSignedUrls(paths: string[], expiresInSeconds: number, area: StorageArea = "media"): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { client, bucket } = config(area);
  for (const path of new Set(paths)) urls.set(path, await signedLink(client, bucket, path, expiresInSeconds));
  return urls;
}

// A short-lived link that downloads the object under the given file name, or null when it's missing.
export async function getDownloadUrl(path: string, expiresInSeconds: number, fileName: string, area: StorageArea): Promise<string | null> {
  if (!(await existingPaths([path], area)).has(path)) return null;
  const { client, bucket } = config(area);
  return signedLink(client, bucket, path, expiresInSeconds, fileName);
}
