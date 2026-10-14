import { Pool } from "pg";

// Route Handlers / Server Actions only — proxy.ts uses JWT claims instead
// (see its comment). DATABASE_URL should be the pooler string; see .env.example.

declare global {
  // eslint-disable-next-line no-var
  var pgPool: Pool | undefined;
}

// Give up instead of hanging when the database can't be reached or a query stalls; the page then shows
// its error screen. The slowest job, archiving a month of login records, takes a few seconds.
const CONNECT_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 30_000;
// Connections each running copy of the site may open (DATABASE_POOL_MAX). Serverless hosts run many copies,
// so 1–3 there keeps the total under the database's limit; one long-running server can use the default.
const DEFAULT_POOL_MAX = 10;

function poolMax(): number {
  const value = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(value) && value >= 1 && value <= 50 ? value : DEFAULT_POOL_MAX;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const created = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
    max: poolMax(),
  });
  // An idle connection the database dropped: log it; without a listener it would stop the server.
  created.on("error", (error) => console.error("Database connection dropped", error));
  return created;
}

// Reuse the pool across hot reloads in dev instead of opening a new one per
// request.
export const pool = global.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  global.pgPool = pool;
}
