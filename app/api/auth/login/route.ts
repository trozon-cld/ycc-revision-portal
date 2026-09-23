import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool } from "@/lib/db/pool";
import { signToken, type UserRole } from "@/lib/auth/jwt";
import { setAuthCookie } from "@/lib/auth/cookies";
import { ipFromHeaders, logAuthEvent } from "@/lib/audit/log";

// Valid credentials always log in, even if blocked/expired — proxy.ts
// then redirects that candidate to /access-expired.

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

  const invalidCredentials = async (user?: { id: string; role: UserRole }) => {
    await logAuthEvent(
      pool,
      "login_failed",
      { id: user?.id ?? null, email, role: user?.role ?? null },
      ipAddress
    );
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  };

  const { rows } = await pool.query(
    `select id, email, password_hash, role, is_blocked, access_expires_at
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

  const token = await signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    isBlocked: user.is_blocked,
    accessExpiresAt: user.access_expires_at
      ? new Date(user.access_expires_at).toISOString()
      : null,
  });

  await pool.query(
    `insert into login_logs (user_id, ip_address) values ($1, $2)`,
    [user.id, ipAddress]
  );
  await logAuthEvent(
    pool,
    "login_success",
    { id: user.id, email: user.email, role: user.role },
    ipAddress
  );

  const redirectTo = user.role === "candidate" ? "/dashboard" : "/admin";

  await setAuthCookie(token);
  return NextResponse.json({ role: user.role, redirectTo });
}
