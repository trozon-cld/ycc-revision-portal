// Browser-only: opens a batch zip in memory and checks its pictures as the Media page does, before anything is sent.

import { unzipSync } from "fflate";
import { MAX_SOURCE_BYTES } from "@/lib/media/limits";
import type { PictureFileInfo } from "./format";
import { MAX_BATCH_PICTURES, MAX_BATCH_ZIP_BYTES } from "./limits";

export type OpenedBatch =
  | { ok: true; content: unknown; files: PictureFileInfo[]; pictures: Map<string, Uint8Array> }
  | { ok: false; error: string };

// Zip clutter from macOS and Windows; never part of a batch.
const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;
const KINDS: { type: string; test: (b: Uint8Array) => boolean }[] = [
  { type: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/webp", test: (b) => String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" && String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP" },
];

export async function openBatchZip(file: File): Promise<OpenedBatch> {
  if (file.size > MAX_BATCH_ZIP_BYTES) return { ok: false, error: `The zip must be ${MAX_BATCH_ZIP_BYTES / 1024 / 1024} MB or smaller. Split the batch.` };
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (entry) => !JUNK.test(entry.name) && !entry.name.endsWith("/") });
  } catch {
    return { ok: false, error: "This file couldn't be opened as a zip. Make a new zip of the batch folder and try again." };
  }

  // content.json at the top, or inside one folder (zipping a folder on Windows or a Mac puts it there).
  const found = Object.keys(entries).filter((name) => /^([^/]+\/)?content\.json$/i.test(name));
  if (found.length === 0) return { ok: false, error: "The zip has no content.json. Zip the batch folder (content.json and the pictures folder)." };
  if (found.length > 1) return { ok: false, error: "The zip has more than one content.json. Upload one batch at a time." };
  const root = found[0].slice(0, found[0].length - "content.json".length);

  let content: unknown;
  try {
    content = JSON.parse(new TextDecoder().decode(entries[found[0]]));
  } catch (error) {
    return { ok: false, error: `content.json isn't valid: ${error instanceof Error ? error.message : "it couldn't be read"}.` };
  }

  const prefix = `${root}pictures/`.toLowerCase();
  const names = Object.keys(entries).filter((name) => name.toLowerCase().startsWith(prefix) && !name.slice(prefix.length).includes("/"));
  if (names.length > MAX_BATCH_PICTURES) return { ok: false, error: `A batch can have up to ${MAX_BATCH_PICTURES} pictures. Split the batch.` };
  const files: PictureFileInfo[] = [];
  const pictures = new Map<string, Uint8Array>();
  for (const name of names) {
    const data = entries[name];
    const short = name.slice(prefix.length);
    pictures.set(short.toLowerCase(), data);
    files.push({ name: short, bytes: data.byteLength, sha256: await sha256(data), error: await pictureError(data) });
  }
  return { ok: true, content, files, pictures };
}

async function pictureError(data: Uint8Array): Promise<string | null> {
  const kind = KINDS.find((candidate) => candidate.test(data));
  if (!kind) return "Not a PNG, JPEG or WebP picture.";
  if (data.byteLength > MAX_SOURCE_BYTES) return `Larger than ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`;
  try {
    const bitmap = await createImageBitmap(new Blob([data as BlobPart], { type: kind.type }));
    bitmap.close();
    return null;
  } catch {
    return "This picture couldn't be read. It may be damaged.";
  }
}

async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
