import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin, readSmallBody } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { restoreAudioFile } from "@/lib/content/backup/audio";
import { MAX_AUDIO_FILE_BYTES } from "@/lib/content/backup/limits";

// One MP3 from an audio backup (?path=pages/… or questions/…), sent as it is. Login, origin and size checked before reading.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, error: "Your sign-in has ended. Log in again to restore." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 403 });
  const body = await readSmallBody(request, MAX_AUDIO_FILE_BYTES);
  if (!body.ok) {
    return NextResponse.json({ ok: false, error: body.tooLarge ? "An audio file in the backup is too large." : "Something went wrong. Please try again." }, { status: body.tooLarge ? 413 : 400 });
  }
  return NextResponse.json(await restoreAudioFile(request.nextUrl.searchParams.get("path") ?? "", new Uint8Array(body.bytes)));
}
