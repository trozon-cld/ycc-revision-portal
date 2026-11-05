import { formatBytes } from "@/lib/format";
import { MAX_THUMB_BYTES, MAX_UPLOAD_BYTES } from "@/lib/media/limits";

// Server only: sizes set by the host and the storage plan, from the host's settings (see docs/operations.md).
// A missing or invalid setting falls back to the default below, so a typo never removes a limit.

// Vercel Functions take at most 4.5 MB in a request or a response; hosts state it in decimal megabytes.
const DEFAULT_HOST_REQUEST_LIMIT_MB = 4.5;
// Supabase Free includes 1 GB of storage; counted in binary megabytes, as the Media page shows it.
const DEFAULT_STORAGE_LIMIT_MB = 900;
// Room for the form's own fields alongside a picture and its thumbnail.
const FORM_MARGIN_BYTES = 64 * 1024;

function readMb(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (Number.isFinite(value) && value >= min && value <= max) return value;
  console.warn(`${name} must be a number from ${min} to ${max}; using ${fallback}.`);
  return fallback;
}

// The largest request or response the host lets through.
export const HOST_REQUEST_LIMIT_BYTES = Math.floor(readMb("HOST_REQUEST_LIMIT_MB", DEFAULT_HOST_REQUEST_LIMIT_MB, 2, 1000) * 1_000_000);

// Uploads and new audio stop once pictures, archives and audio reach this.
export const STORAGE_LIMIT_BYTES = Math.floor(readMb("STORAGE_LIMIT_MB", DEFAULT_STORAGE_LIMIT_MB, 100, 10_000_000) * 1024 * 1024);

// A size limit of our own, lowered to what the host lets through.
export function withinHostLimit(bytes: number): number {
  return Math.min(bytes, HOST_REQUEST_LIMIT_BYTES);
}

// The largest picture (after preparing) whose upload, with its thumbnail and fields, fits the host's limit.
export const MAX_PICTURE_BYTES = Math.min(MAX_UPLOAD_BYTES, HOST_REQUEST_LIMIT_BYTES - MAX_THUMB_BYTES - FORM_MARGIN_BYTES);
export const MAX_PICTURE_REQUEST_BYTES = MAX_PICTURE_BYTES + MAX_THUMB_BYTES + FORM_MARGIN_BYTES;

// A download bigger than the host lets through would end in the host's own error; this says why instead.
export function tooLargeForHost(what: string, bytes: number): string | null {
  if (bytes <= HOST_REQUEST_LIMIT_BYTES) return null;
  console.error(`${what} is ${bytes} bytes, over the host's limit of ${HOST_REQUEST_LIMIT_BYTES} (HOST_REQUEST_LIMIT_MB).`);
  return `${what} (${formatBytes(bytes)}) is larger than this host lets through (${formatBytes(HOST_REQUEST_LIMIT_BYTES)}), so it can't be downloaded. Nothing was saved.`;
}
