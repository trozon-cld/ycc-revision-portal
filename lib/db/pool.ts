import { Pool, type PoolClient } from "pg";

// Route Handlers / Server Actions only — proxy.ts uses JWT claims instead
// (see its comment). DATABASE_URL should be the pooler string; see .env.example.

declare global {
  var pgPool: Pool | undefined;
}

// Give up instead of hanging when the database can't be reached or a query stalls; the page then shows
// its error screen. The slowest job, archiving a month of login records, takes a few seconds.
const CONNECT_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 30_000;
// Keep idle connections a minute (pg's default is 10 seconds): opening one to a distant database is slow.
const IDLE_TIMEOUT_MS = 60_000;
// Connections each running copy of the site may open (DATABASE_POOL_MAX). Serverless hosts run many copies,
// so 1–3 there keeps the total under the database's limit; one long-running server can use the default.
const DEFAULT_POOL_MAX = 10;

function poolMax(): number {
  const value = Number(process.env.DATABASE_POOL_MAX);
  return Number.isInteger(value) && value >= 1 && value <= 50 ? value : DEFAULT_POOL_MAX;
}

// A query (including any wait for a connection) slower than this is written to the server log, SQL text only.
const SLOW_QUERY_MS = 5_000;

const CONNECT_TIMEOUT_ERRORS = ["timeout exceeded when trying to connect", "Connection terminated due to connection timeout"];

function isConnectTimeout(error: unknown): boolean {
  return error instanceof Error && CONNECT_TIMEOUT_ERRORS.includes(error.message);
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
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    // Stops routers and Wi-Fi silently dropping idle connections (the next use would then hang or reconnect slowly).
    keepAlive: true,
    max: poolMax(),
  });
  // An idle connection the database dropped: log it; without a listener it would stop the server.
  created.on("error", (error) => console.error("Database connection dropped", error));

  // No connection within the time limit: try once more before giving up. Nothing was sent yet, so nothing runs twice.
  // The log line says whether every connection was busy or a new one was slow to open.
  const retryConnect = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      if (!isConnectTimeout(error)) throw error;
      console.warn(
        `Database: no connection within ${CONNECT_TIMEOUT_MS / 1000} s (${created.totalCount} open, ${created.idleCount} idle, ${created.waitingCount} waiting); trying once more`
      );
      return run();
    }
  };
  const rawConnect = created.connect.bind(created) as (callback?: unknown) => Promise<PoolClient>;
  // pool.query: borrow a connection, run, give it back (as pg does; a failed query's connection is replaced). The slow
  // line splits waiting for a connection (busy pool, slow network, opening one) from the query itself.
  (created as unknown as { query: unknown }).query = async (...args: unknown[]) => {
    const started = Date.now();
    const client = await retryConnect(() => rawConnect());
    const connected = Date.now();
    let failed: Error | undefined;
    try {
      return await (client.query as (...queryArgs: unknown[]) => Promise<unknown>)(...args);
    } catch (error) {
      failed = error instanceof Error ? error : new Error(String(error));
      throw error;
    } finally {
      client.release(failed);
      const took = Date.now() - started;
      if (took > SLOW_QUERY_MS) {
        const sql = typeof args[0] === "string" ? args[0] : "";
        const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
        console.warn(
          `Database: slow query (${seconds(took)}: waited ${seconds(connected - started)} for a connection, query ${seconds(Date.now() - connected)}): ${sql.replace(/\s+/g, " ").trim().slice(0, 100)}`
        );
      }
    }
  };
  // A connect with a callback is passed straight through; the promise form tries once more on a timeout.
  (created as unknown as { connect: unknown }).connect = (callback?: unknown) =>
    typeof callback === "function" ? rawConnect(callback) : retryConnect(() => rawConnect());
  return created;
}

// Reuse the pool across hot reloads in dev instead of opening a new one per
// request.
export const pool = global.pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  global.pgPool = pool;
}
