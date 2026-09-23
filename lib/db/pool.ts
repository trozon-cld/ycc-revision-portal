import { Pool } from "pg";

// Used from Route Handlers / Server Actions (Node runtime). Proxy
// (proxy.ts) uses JWT claims instead of calling this directly — see its
// comment for why, even though Next 16's Proxy can run Node code now.
//
// DATABASE_URL: use Supabase's connection pooler string (port 6543), not
// the direct connection (port 5432). Two reasons: it avoids exhausting
// Postgres connections once deployed serverless, and — as found during Day
// 1 testing — some networks block outbound 5432 entirely, causing
// ETIMEDOUT, while the pooler's port works. See .env.example.

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}

// Reuse the pool across hot reloads in dev instead of opening a new one per
// request.
export const pool = global.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  global.pgPool = pool;
}
