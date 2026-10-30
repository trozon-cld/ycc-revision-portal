import { gzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin, readSmallJson } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { readAudioBackup } from "@/lib/content/backup/audio";
import { isRecord } from "@/lib/text";

// One language's audio records and file links, gzipped (the browser fetches the files and builds the zip). Read only;
// logged by ./saved.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, error: "Your sign-in has ended. Log in again to make a backup." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 403 });
  const body = await readSmallJson(request, 1024);
  if (!body.ok || !isRecord(body.value)) return NextResponse.json({ ok: false, error: "Choose a language." }, { status: 400 });
  const result = await readAudioBackup(live.session, body.value.language);
  if (!result.ok) return NextResponse.json(result, { status: 409 });
  return new NextResponse(gzipSync(JSON.stringify(result.data)), { headers: { "content-type": "application/gzip", "cache-control": "no-store" } });
}
