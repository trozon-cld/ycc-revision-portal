import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { CONTENT_EDITORS } from "@/lib/auth/content-editors";
import { isSameOrigin } from "@/lib/auth/request";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_REQUEST_BYTES } from "@/lib/media/limits";
import { saveUpload } from "@/lib/media/upload";

// Picture uploads have their own address, so only signed-in content editors can send a large request: the login
// is checked before anything is read. Every other request keeps Next's normal 1 MB limit.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !CONTENT_EDITORS.includes(live.account.role)) {
    return NextResponse.json({ error: "Your sign-in has ended. Log in again to upload pictures." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 403 });
  }
  const length = Number(request.headers.get("content-length"));
  if (!length) return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 411 });
  if (length > MAX_UPLOAD_REQUEST_BYTES) {
    return NextResponse.json({ error: `The picture must be ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB or smaller.` }, { status: 413 });
  }
  const formData = await request.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Choose a picture to upload." }, { status: 400 });
  return NextResponse.json(await saveUpload(live.session, formData));
}
