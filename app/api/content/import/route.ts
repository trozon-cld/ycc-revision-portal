import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { isSameOrigin, readSmallJson } from "@/lib/auth/request";
import { importBatch } from "@/lib/content/import/run";
import { readPictureList } from "@/lib/content/import/format";
import { MAX_CHECK_REQUEST_BYTES } from "@/lib/content/import/limits";
import { isRecord } from "@/lib/text";

// Bulk upload import: after the pictures, the browser sends content.json and the picture list again; the batch is
// checked once more and saved in one go. Same checks as /api/content/check before anything is read.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !CONTENT_EDITORS.includes(live.account.role)) {
    return NextResponse.json({ ok: false, error: "Your sign-in has ended. Log in again to import." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 403 });
  }
  const body = await readSmallJson(request, MAX_CHECK_REQUEST_BYTES);
  if (!body.ok) {
    return body.tooLarge
      ? NextResponse.json({ ok: false, error: `content.json must be ${MAX_CHECK_REQUEST_BYTES / 1024 / 1024} MB or smaller. Split the batch.` }, { status: 413 })
      : NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 400 });
  }
  const files = readPictureList(isRecord(body.value) ? body.value.pictures : null);
  if (!isRecord(body.value) || !files) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 400 });
  const result = await importBatch(live.session, body.value.content, files);
  if (result.ok) {
    revalidatePath("/admin/handbook", "layout");
    revalidatePath("/admin/questions");
    revalidatePath("/admin/media");
  }
  return NextResponse.json(result);
}
