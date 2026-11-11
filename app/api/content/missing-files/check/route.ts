import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin, readSmallJson } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { checkMissingFiles, FILE_KINDS, MAX_CHECK_PATHS, type FileKind } from "@/lib/content/backup/missing-files";
import { isRecord } from "@/lib/text";

// Put back missing files, step 1: which of a backup's files the database lists and storage lacks. Read only.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, error: "Your sign-in has ended. Log in again to put files back." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 403 });
  const body = await readSmallJson(request, 2 * 1024 * 1024);
  const value = body.ok && isRecord(body.value) ? body.value : null;
  const kind = FILE_KINDS.find((k) => k === value?.kind) as FileKind | undefined;
  const paths = Array.isArray(value?.paths) && value.paths.every((path) => typeof path === "string") ? (value.paths as string[]) : null;
  if (!kind || !paths || paths.length > MAX_CHECK_PATHS) return NextResponse.json({ ok: false, error: "This file can't be checked. Choose a backup file again." }, { status: 400 });
  return NextResponse.json(await checkMissingFiles(kind, paths));
}
