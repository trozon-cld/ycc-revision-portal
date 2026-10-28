import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { isSameOrigin, readSmallJson } from "@/lib/auth/request";
import { pool } from "@/lib/db/pool";
import { checkBatch } from "@/lib/content/import/check";
import type { PictureFileInfo } from "@/lib/content/import/format";
import { MAX_BATCH_PICTURES, MAX_CHECK_REQUEST_BYTES } from "@/lib/content/import/limits";
import { isRecord } from "@/lib/text";

// Bulk upload check: the browser opens the zip and sends content.json with what it found in the pictures folder.
// Its own address, as a whole chapter's text can be bigger than other requests may be; nothing is saved.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !CONTENT_EDITORS.includes(live.account.role)) {
    return NextResponse.json({ error: "Your sign-in has ended. Log in again to check the batch." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 403 });
  }
  const body = await readSmallJson(request, MAX_CHECK_REQUEST_BYTES);
  if (!body.ok) {
    return body.tooLarge
      ? NextResponse.json({ error: `content.json must be ${MAX_CHECK_REQUEST_BYTES / 1024 / 1024} MB or smaller. Split the batch.` }, { status: 413 })
      : NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 400 });
  }
  const files = readFiles(isRecord(body.value) ? body.value.pictures : null);
  if (!isRecord(body.value) || !files) return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 400 });
  return NextResponse.json({ report: await checkBatch(pool, body.value.content, files) });
}

// The browser's findings about each picture file, kept to what the check uses.
function readFiles(value: unknown): PictureFileInfo[] | null {
  if (!Array.isArray(value) || value.length > MAX_BATCH_PICTURES * 2) return null;
  const files: PictureFileInfo[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.name !== "string" || !raw.name || raw.name.length > 255) return null;
    const sha256 = typeof raw.sha256 === "string" && /^[0-9a-f]{64}$/.test(raw.sha256) ? raw.sha256 : null;
    const bytes = typeof raw.bytes === "number" && raw.bytes >= 0 ? raw.bytes : 0;
    const error = typeof raw.error === "string" && raw.error ? raw.error.slice(0, 200) : null;
    files.push({ name: raw.name, sha256, bytes, error });
  }
  return files;
}
