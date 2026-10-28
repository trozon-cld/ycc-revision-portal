import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin, readSmallJson } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { recordBackupSaved } from "@/lib/content/backup/export";

const MAX_BYTES = 64 * 1024;

// The browser says the backup zip was built and saved; this writes the "Downloaded backup" log entry.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false }, { status: 403 });
  const body = await readSmallJson(request, MAX_BYTES);
  if (!body.ok) return NextResponse.json({ ok: false }, { status: body.tooLarge ? 413 : 400 });
  const ok = await recordBackupSaved(live.session, body.value);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
