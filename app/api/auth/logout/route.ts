import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db/pool";
import { getSession } from "@/lib/auth/session";
import { getLiveSession } from "@/lib/auth/guard";
import { clearAuthCookie } from "@/lib/auth/cookies";
import { isJsonRequest } from "@/lib/auth/constants";
import { MAX_LOGIN_BODY_BYTES, readSmallJson } from "@/lib/auth/request";
import { ipFromHeaders, logAuthEvent } from "@/lib/audit/log";
import { shouldRecordLogout } from "@/lib/auth/rate-limit";

export async function POST(request: NextRequest) {
  if (!isJsonRequest(request.headers)) {
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 415 });
  }
  const read = await readSmallJson(request, MAX_LOGIN_BODY_BYTES);
  const everywhere = read.ok && typeof read.value === "object" && read.value !== null && (read.value as { everywhere?: unknown }).everywhere === true;

  const session = await getSession();
  // "Log out of all devices": raising the version ends every sign-in, as a password change does.
  if (everywhere) {
    const live = await getLiveSession();
    if (live) {
      await pool.query(`update users set session_version = session_version + 1 where id = $1 and session_version = $2`, [live.session.sub, live.session.ver]);
    }
  }
  if (session && (await shouldRecordLogout(pool, session.sub))) {
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
