// How the database connection is protected; shared by lib/db/pool.ts and scripts/restore-database.mjs.
import fs from "node:fs";
import { AWS_RDS_CA } from "./aws-rds-ca.mjs";

// DATABASE_SSL: "verify" (default) encrypts and checks the server's certificate and name, like sslmode=verify-full;
// "no-verify" only encrypts (another provider without its certificate file).
const MODES = ["verify", "no-verify"];
// Connection-string options that pg would let override the settings below.
const URL_SSL_OPTIONS = ["sslmode", "ssl", "sslcert", "sslkey", "sslrootcert", "sslpassword", "uselibpqcompat"];
const CERTIFICATE_CODES = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_UNTRUSTED",
  "CERT_SIGNATURE_FAILURE",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/**
 * The `ssl` option for pg, and any warnings to write to the server log.
 * @param {Record<string, string | undefined>} env
 * @returns {{ ssl: { rejectUnauthorized: boolean, ca?: string }, warnings: string[] }}
 */
export function databaseSsl(env = process.env) {
  const chosen = (env.DATABASE_SSL ?? "").trim();
  const warnings = [];
  if (chosen && !MODES.includes(chosen)) warnings.push(`Database: DATABASE_SSL "${chosen}" isn't "verify" or "no-verify"; using "verify".`);
  if (chosen === "no-verify") {
    warnings.push("Database: DATABASE_SSL=no-verify, so the connection is encrypted but the server's certificate isn't checked.");
    return { ssl: { rejectUnauthorized: false }, warnings };
  }
  const file = (env.DATABASE_SSL_CA_FILE ?? "").trim();
  let ca = AWS_RDS_CA;
  if (file) {
    try {
      ca = fs.readFileSync(file, "utf8");
    } catch {
      throw new Error(`DATABASE_SSL_CA_FILE: can't read "${file}".`);
    }
  }
  return { ssl: { rejectUnauthorized: true, ca }, warnings };
}

/**
 * The connection string without SSL options, so the settings above always apply.
 * @param {string} connectionString
 * @returns {string}
 */
export function withoutSslOptions(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return connectionString;
  }
  if (!URL_SSL_OPTIONS.some((name) => url.searchParams.has(name))) return connectionString;
  for (const name of URL_SSL_OPTIONS) url.searchParams.delete(name);
  return url.toString();
}

/**
 * A server-log line when a connection failed because the certificate check failed, otherwise null.
 * @param {unknown} error
 * @returns {string | null}
 */
export function certificateProblem(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (!CERTIFICATE_CODES.has(code)) return null;
  return `Database: the server's certificate couldn't be verified (${code}). On AWS RDS, connect with the database's endpoint name; for another provider set DATABASE_SSL_CA_FILE to its certificate file, or DATABASE_SSL=no-verify.`;
}
