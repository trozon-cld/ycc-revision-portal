import { isIP } from "node:net";

// Server-only: the visitor's address from X-Forwarded-For. Each host adds the address it saw to the end of the list and
// anything before it can be typed in by the visitor, so it's read TRUSTED_PROXY_HOPS entries from the end (1 = last).

const DEFAULT_HOPS = 1;
const MAX_HOPS = 5;

export function readTrustedProxyHops(raw: string | undefined): { hops: number; warning: string | null } {
  const text = raw?.trim();
  if (!text) return { hops: DEFAULT_HOPS, warning: null };
  const value = Number(text);
  if (Number.isInteger(value) && value >= 1 && value <= MAX_HOPS) return { hops: value, warning: null };
  return { hops: DEFAULT_HOPS, warning: `TRUSTED_PROXY_HOPS should be a whole number from 1 to ${MAX_HOPS}; using ${DEFAULT_HOPS}.` };
}

const setting = readTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS);
if (setting.warning) console.warn(setting.warning);
export const TRUSTED_PROXY_HOPS = setting.hops;

// Every entry of X-Forwarded-For, first to last, as sent.
export function forwardedAddresses(requestHeaders: Headers): string[] {
  return (requestHeaders.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// The entry `hops` from the end, as a plain IP address ("203.0.113.8:443" and "[2001:db8::1]:443" lose the port);
// missing or not an IP address: null.
export function visitorAddress(entries: string[], hops: number): string | null {
  const entry = entries[entries.length - hops];
  if (!entry) return null;
  const ip = /^\[([^\]]+)\](?::\d+)?$/.exec(entry)?.[1] ?? /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(entry)?.[1] ?? entry;
  return isIP(ip) ? ip : null;
}

export function ipFromHeaders(requestHeaders: Headers): string | null {
  return visitorAddress(forwardedAddresses(requestHeaders), TRUSTED_PROXY_HOPS);
}
