import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cronSecret } from "@/lib/database-backup/list";
import { makeDatabaseBackup } from "@/lib/database-backup/make";

// The daily database backup, called by the host's scheduler (Vercel Cron sends "Authorization: Bearer <CRON_SECRET>").
// Closed until CRON_SECRET is set; makes at most one backup in AUTOMATIC_MIN_HOURS however often it's called.
export async function GET(request: NextRequest) {
  const secret = cronSecret();
  if (!secret) return NextResponse.json({ ok: false, error: "The schedule isn't set up: CRON_SECRET is missing or too short." }, { status: 503 });
  if (!sameSecret(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  const result = await makeDatabaseBackup({ schedule: true });
  if (result.ok) return NextResponse.json({ ok: true, kind: result.kind, bytes: result.bytes });
  if (result.skipped) return NextResponse.json({ ok: true, skipped: result.error });
  console.error("Scheduled database backup failed:", result.error);
  return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
