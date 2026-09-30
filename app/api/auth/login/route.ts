import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db/pool";
import type { UserRole } from "@/lib/auth/jwt";
import { setSessionCookie } from "@/lib/auth/cookies";
import { loginPause, pausedMessage } from "@/lib/auth/rate-limit";
import { ipFromHeaders, logAuthEvent } from "@/lib/audit/log";

// Valid credentials always log in, even if blocked/expired — requireRole then sends that candidate
// to /access-expired.

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const ipAddress = ipFromHeaders(request.headers);

  // Paused: refused before the password is checked, and not logged again (keeps the log bounded).
  const pausedSeconds = await loginPause(pool, email, ipAddress);
  if (pausedSeconds > 0) {
    return NextResponse.json({ error: pausedMessage(pausedSeconds) }, { status: 429 });
  }

  const invalidCredentials = async (user?: { id: string; role: UserRole }) => {
    const who = { id: user?.id ?? null, email, role: user?.role ?? null };
    await logAuthEvent(pool, "login_failed", who, ipAddress);
    // This failure reached a limit: note the pause once and say so now.
    const nowPaused = await loginPause(pool, email, ipAddress);
    if (nowPaused > 0) {
      await logAuthEvent(pool, "login_paused", who, ipAddress);
      return NextResponse.json({ error: pausedMessage(nowPaused) }, { status: 429 });
    }
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  };

  const { rows } = await pool.query<{ id: string; email: string; password_hash: string; role: UserRole; session_version: number }>(
    `select id, email, password_hash, role, session_version
     from users where email = $1`,
    [email]
  );
  const user = rows[0];

  // Same generic error whether the email doesn't exist or the password is
  // wrong, so a failed attempt doesn't reveal which emails are registered.
  if (!user) {
    return invalidCredentials();
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    return invalidCredentials({ id: user.id, role: user.role });
  }

  await logAuthEvent(
    pool,
    "login_success",
    { id: user.id, email: user.email, role: user.role },
    ipAddress
  );

  await setSessionCookie({
    sub: user.id,
    email: user.email,
    role: user.role,
    ver: user.session_version,
    loginAt: Math.floor(Date.now() / 1000),
  });
  const redirectTo = user.role === "candidate" ? "/dashboard" : "/admin";
  return NextResponse.json({ role: user.role, redirectTo });
}
