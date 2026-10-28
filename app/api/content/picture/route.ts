import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { isSameOrigin } from "@/lib/auth/request";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_REQUEST_BYTES } from "@/lib/media/limits";
import { importPicture } from "@/lib/content/import/pictures";

// One picture of a bulk upload, prepared in the browser as on the Media page. Same checks as /api/media/upload:
// the live login, the origin and the size are checked before anything is read.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !CONTENT_EDITORS.includes(live.account.role)) {
    return NextResponse.json({ ok: false, error: "Your sign-in has ended. Log in again to import." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 403 });
  }
  const length = Number(request.headers.get("content-length"));
  if (!length) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 411 });
  if (length > MAX_UPLOAD_REQUEST_BYTES) {
    return NextResponse.json({ ok: false, error: `Each picture must be ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB or smaller after preparing.` }, { status: 413 });
  }
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 400 });
  return NextResponse.json(await importPicture(live.session, formData));
}
