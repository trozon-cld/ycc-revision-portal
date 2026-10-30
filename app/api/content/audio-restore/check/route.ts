import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { checkAudioRestore } from "@/lib/content/backup/audio";
import { readAudioRestoreBody } from "@/lib/content/backup/audio-request";

// Before any audio file is uploaded: which records can come back into this project. Changes nothing.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, problems: ["Your sign-in has ended. Log in again to restore."] }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, problems: ["Something went wrong. Please try again."] }, { status: 403 });
  const body = await readAudioRestoreBody(request);
  if (!body.ok) return NextResponse.json({ ok: false, problems: [body.problem] }, { status: body.status });
  return NextResponse.json(await checkAudioRestore(body.value));
}
