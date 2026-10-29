import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin, readSmallBody } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { restorePicture } from "@/lib/content/backup/restore";
import { MAX_UPLOAD_BYTES } from "@/lib/media/limits";

// One stored picture file from a backup (?path=media/…), sent as it is. Login, origin and size checked before reading.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, error: "Your sign-in has ended. Log in again to restore." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 403 });
  const body = await readSmallBody(request, MAX_UPLOAD_BYTES);
  if (!body.ok) return NextResponse.json({ ok: false, error: body.tooLarge ? "A picture in the backup is too large." : "Something went wrong. Please try again." }, { status: body.tooLarge ? 413 : 400 });
  const path = request.nextUrl.searchParams.get("path") ?? "";
  return NextResponse.json(await restorePicture(path, new Uint8Array(body.bytes)));
}
