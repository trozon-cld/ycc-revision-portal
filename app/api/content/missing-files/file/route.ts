import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin, readSmallBody } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { MAX_AUDIO_FILE_BYTES } from "@/lib/content/backup/limits";
import { FILE_KINDS, putBackFile, type FileKind } from "@/lib/content/backup/missing-files";
import { withinHostLimit } from "@/lib/hosting";
import { MAX_UPLOAD_BYTES } from "@/lib/media/limits";

// Put back missing files, step 2: one file (?kind=pictures|audio&path=…), sent as it is. Login, origin and size first.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, error: "Your sign-in has ended. Log in again to put files back." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 403 });
  const kind = FILE_KINDS.find((k) => k === request.nextUrl.searchParams.get("kind")) as FileKind | undefined;
  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!kind || !path) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 400 });
  const body = await readSmallBody(request, withinHostLimit(kind === "pictures" ? MAX_UPLOAD_BYTES : MAX_AUDIO_FILE_BYTES));
  if (!body.ok) {
    return NextResponse.json({ ok: false, error: body.tooLarge ? `${path.slice(0, 120)} is larger than this host lets through.` : "Something went wrong. Please try again." }, { status: body.tooLarge ? 413 : 400 });
  }
  try {
    const result = await putBackFile(kind, path, new Uint8Array(body.bytes));
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    console.error("Putting back a file failed:", error);
    return NextResponse.json({ ok: false, error: "A file couldn't be saved to storage. Please try again." }, { status: 500 });
  }
}
