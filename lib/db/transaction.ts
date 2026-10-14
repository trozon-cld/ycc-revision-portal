import type { PoolClient } from "pg";
import { pool } from "./pool";

// Commits only if fn resolves; any throw rolls the whole unit back.
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    // If even the rollback fails the connection is broken: throw it away rather than reuse it.
    await client.query("rollback").catch((rollbackError: Error) => {
      broken = rollbackError;
    });
    throw error;
  } finally {
    client.release(broken);
  }
}

export function getErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}
