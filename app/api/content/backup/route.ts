import { gzipSync } from "node:zlib";
import { NextRequest, NextResponse } from "next/server";
import { getLiveSession } from "@/lib/auth/guard";
import { isSameOrigin } from "@/lib/auth/request";
import { BACKUP_ROLES } from "@/lib/content/backup/access";
import { readBackup } from "@/lib/content/backup/export";

// Everything a backup holds, gzipped (the browser fetches the pictures and builds the zip). Read only; logged by ./saved.
export async function POST(request: NextRequest) {
  const live = await getLiveSession();
  if (!live || !BACKUP_ROLES.includes(live.account.role)) {
    return NextResponse.json({ ok: false, error: "Your sign-in has ended. Log in again to make a backup." }, { status: 401 });
  }
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 403 });
  }
  const result = await readBackup(live.session);
  if (!result.ok) return NextResponse.json(result, { status: 409 });
  return new NextResponse(gzipSync(JSON.stringify(result.data)), {
    headers: { "content-type": "application/gzip", "cache-control": "no-store" },
  });
}
