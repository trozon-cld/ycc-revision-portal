import { Pool } from "pg";

// Route Handlers / Server Actions only — proxy.ts uses JWT claims instead
// (see its comment). DATABASE_URL should be the pooler string; see .env.example.

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
