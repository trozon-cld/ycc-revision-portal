import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin, readSmallJson } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { FILE_KINDS, logPutBack, type FileKind } from "@/lib/content/backup/missing-files";
import { isRecord } from "@/lib/text";

// Put back missing files, step 3: logs the run and counts what's still missing.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, error: "Your sign-in has ended. Log in again." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 403 });
  const body = await readSmallJson(request, 1024);
  const value = body.ok && isRecord(body.value) ? body.value : null;
  const kind = FILE_KINDS.find((k) => k === value?.kind) as FileKind | undefined;
  const putBack = Number(value?.putBack);
  if (!kind || !Number.isInteger(putBack) || putBack < 0 || putBack > 100_000) {
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 400 });
  }
  return NextResponse.json(await logPutBack(live.session, kind, putBack));
}
