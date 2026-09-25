import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db/pool";
import { getSession } from "@/lib/auth/session";
import { clearAuthCookie } from "@/lib/auth/cookies";
import { ipFromHeaders, logAuthEvent } from "@/lib/audit/log";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (session) {
    await logAuthEvent(
      pool,
      "logout",
      { id: session.sub, email: session.email, role: session.role },
      ipFromHeaders(request.headers)
    );
  }

  await clearAuthCookie();
  return NextResponse.json({ ok: true });
}
