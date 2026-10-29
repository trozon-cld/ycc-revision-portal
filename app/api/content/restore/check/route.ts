import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin, readSmallJson } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { MAX_RESTORE_CHECK_BYTES } from "@/lib/content/backup/limits";
import { checkRestore } from "@/lib/content/backup/restore";
import { isRecord } from "@/lib/text";

// Before a restore uploads anything: the backup's manifest against this project (empty, same version, candidates).
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, problems: ["Your sign-in has ended. Log in again to restore."] }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, problems: ["Something went wrong. Please try again."] }, { status: 403 });
  const body = await readSmallJson(request, MAX_RESTORE_CHECK_BYTES);
  if (!body.ok || !isRecord(body.value)) return NextResponse.json({ ok: false, problems: ["The backup's manifest is damaged."] }, { status: 400 });
  return NextResponse.json(await checkRestore(body.value.manifest, body.value.testTypeIds, body.value.pictureBytes));
}
