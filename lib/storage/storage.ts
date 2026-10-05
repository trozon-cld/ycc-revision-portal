// The only file that knows the storage provider (Supabase Storage REST). Server-only:
// it reads the service key, so never import it from a client component.

// Pictures and log archives live in separate private buckets.
export type StorageArea = "media" | "archives";
const BUCKETS: Record<StorageArea, { env: string; fallback: string }> = {
  media: { env: "SUPABASE_STORAGE_BUCKET", fallback: "handbook-media" },
  archives: { env: "SUPABASE_ARCHIVE_BUCKET", fallback: "log-archives" },
};
const IMMUTABLE_MAX_AGE = "max-age=31536000";

export class StorageConfigError extends Error {}

function config(area: StorageArea = "media") {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env[BUCKETS[area].env] || BUCKETS[area].fallback;
  if (!url || !key) {
    throw new StorageConfigError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use images.");
  }
  return { base: `${url}/storage/v1`, key, bucket };
}

// New secret keys (sb_secret_…) go on apikey only; legacy service_role JWTs also need Bearer.
function authHeaders(key: string): Record<string, string> {
  return key.startsWith("eyJ") ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

export function isStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Media paths are unique per upload, so objects never change and can be cached for a year.
// `replace`: for fixed paths written again on a retry (log archives); those aren't cached.
export async function storeObject(
  path: string,
  body: Blob,
  contentType: string,
  { replace = false, area = "media" }: { replace?: boolean; area?: StorageArea } = {}
): Promise<void> {
  const { base, key, bucket } = config(area);
  const response = await fetch(`${base}/object/${encodeURIComponent(bucket)}/${encodePath(path)}`, {
    method: "POST",
    headers: {
      ...authHeaders(key),
      "Content-Type": contentType,
      "cache-control": replace ? "no-cache" : IMMUTABLE_MAX_AGE,
      "x-upsert": replace ? "true" : "false",
    },
    body,
  });
  if (!response.ok) {
    const text = await safeText(response);
    if (/bucket not found/i.test(text)) throw new StorageConfigError(`The storage bucket "${bucket}" doesn't exist yet.`);
    throw new Error(`Storage upload failed (${response.status}): ${text}`);
  }
}

export async function deleteObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { base, key, bucket } = config();
  const response = await fetch(`${base}/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: paths }),
  });
  if (!response.ok) throw new Error(`Storage delete failed (${response.status}): ${await safeText(response)}`);
}

// Short-lived links to private objects. Missing objects are left out of the map.
export async function getSignedUrls(paths: string[], expiresInSeconds: number, area: StorageArea = "media"): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { base, key, bucket } = config(area);
  const response = await fetch(`${base}/object/sign/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: expiresInSeconds, paths }),
  });
  if (!response.ok) throw new Error(`Storage signing failed (${response.status}): ${await safeText(response)}`);

  const results = (await response.json()) as { path?: string; signedURL?: string | null; error?: string | null }[];
  for (const result of results) {
    if (result.path && result.signedURL) urls.set(result.path, `${base}${result.signedURL}`);
  }
  return urls;
}

async function safeText(response: Response) {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "";
  }
}
