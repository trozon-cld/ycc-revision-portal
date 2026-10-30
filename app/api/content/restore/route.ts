import { gunzipSync } from "node:zlib";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin, readSmallBody } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { MAX_RESTORE_DATA_BYTES, MAX_RESTORE_JSON_BYTES } from "@/lib/content/backup/limits";
import { restoreBackup } from "@/lib/content/backup/restore";

// The backup's data (gzipped JSON from the browser), saved in one transaction once its pictures are uploaded.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, problems: ["Your sign-in has ended. Log in again to restore."] }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, problems: ["Something went wrong. Please try again."] }, { status: 403 });
  const body = await readSmallBody(request, MAX_RESTORE_DATA_BYTES);
  if (!body.ok) return NextResponse.json({ ok: false, problems: [body.tooLarge ? "This backup is too large to restore." : "Something went wrong. Please try again."] }, { status: body.tooLarge ? 413 : 400 });
  let data: unknown;
  try {
    data = JSON.parse(gunzipSync(body.bytes, { maxOutputLength: MAX_RESTORE_JSON_BYTES }).toString("utf8"));
  } catch {
    return NextResponse.json({ ok: false, problems: ["The backup is damaged."] }, { status: 400 });
  }
  try {
    const result = await restoreBackup(live.session, data);
    if (result.ok) for (const path of ["/admin", "/dashboard"]) revalidatePath(path, "layout");
    return NextResponse.json(result);
  } catch (error) {
    console.error("Restore failed", error);
    return NextResponse.json({ ok: false, problems: ["The restore couldn't be completed, so nothing was changed. The details are in the server log."] }, { status: 500 });
  }
}
