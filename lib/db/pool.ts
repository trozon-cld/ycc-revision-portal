import { Pool } from "pg";

// Node runtime only (Route Handlers, Server Actions) — the `pg` driver
// cannot run in Middleware's Edge runtime. Middleware uses JWT claims
// instead (see middleware.ts).
//
// DATABASE_URL: for serverless/edge deployment targets, prefer Supabase's
// connection pooler string (port 6543) over the direct connection (5432) to
// avoid exhausting Postgres connections. Revisit once the deployment target
// is finalized — see .env.example.

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
