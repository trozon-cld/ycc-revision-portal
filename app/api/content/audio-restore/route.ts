import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { restoreAudio } from "@/lib/content/backup/audio";
import { readAudioRestoreBody } from "@/lib/content/backup/audio-request";

// The audio records (gzipped JSON from the browser), saved in one transaction once their files are uploaded.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, problems: ["Your sign-in has ended. Log in again to restore."] }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, problems: ["Something went wrong. Please try again."] }, { status: 403 });
  const body = await readAudioRestoreBody(request);
  if (!body.ok) return NextResponse.json({ ok: false, problems: [body.problem] }, { status: body.status });
  try {
    const result = await restoreAudio(live.session, body.value);
    if (result.ok) for (const path of ["/admin", "/dashboard"]) revalidatePath(path, "layout");
    return NextResponse.json(result);
  } catch (error) {
    console.error("Audio restore failed", error);
    return NextResponse.json({ ok: false, problems: ["The audio restore couldn't be completed, so no records were saved. The details are in the server log."] }, { status: 500 });
  }
}
