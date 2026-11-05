import { BlockList, SocketAddress, isIPv4, isIPv6 } from "node:net";
import { cache } from "react";
import { pool } from "@/lib/db/pool";
import { OFFICE_ADDRESS_MAX_LENGTH } from "@/lib/limits";
import type { UserRole } from "./jwt";

export type OfficeAddress = { id: string; address: string; label: string; createdAt: string };
export type OfficeNetwork = { isOn: boolean; addresses: OfficeAddress[] };

export const OFFICE_ONLY_PATH = "/office-network-only";
export const OFFICE_ONLY_MESSAGE = "Admin access is only available from the office network. Please connect from the office.";

// Widest ranges accepted, so one typo can't open the check to a whole provider or the whole internet.
const MIN_PREFIX = { ipv4: 16, ipv6: 48 } as const;
const BITS = { ipv4: 32, ipv6: 128 } as const;

type Family = keyof typeof BITS;
type Parsed = { address: string; family: Family; prefix: number | null };

// A request's address in one form: IPv4 sent inside IPv6 ("::ffff:203.0.113.8") counts as the IPv4 address.
function normaliseIp(value: string): { address: string; family: Family } | null {
  const ip = value.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "");
  if (isIPv4(ip)) return { address: ip, family: "ipv4" };
  if (isIPv6(ip)) return { address: new SocketAddress({ address: ip, family: "ipv6" }).address, family: "ipv6" };
  return null;
}

// IPv4 range written with host bits set ("203.0.113.9/30") becomes its first address ("203.0.113.8/30").
function ipv4Network(address: string, prefix: number): string {
  const value = address.split(".").reduce((sum, part) => sum * 256 + Number(part), 0);
  const size = 2 ** (32 - prefix);
  const start = value - (value % size);
  return [24, 16, 8, 0].map((shift) => Math.floor(start / 2 ** shift) % 256).join(".");
}

function parse(input: string): Parsed | null {
  const [ipPart, prefixPart, extra] = input.trim().split("/");
  if (extra !== undefined) return null;
  const ip = normaliseIp(ipPart ?? "");
  if (!ip) return null;
  if (prefixPart === undefined) return { ...ip, prefix: null };
  if (!/^\d{1,3}$/.test(prefixPart)) return null;
  const prefix = Number(prefixPart);
  if (prefix > BITS[ip.family]) return null;
  return { ...ip, prefix };
}

// Checks an address or range typed by the Superadmin; returns the form it's stored in, or the problem.
export function checkOfficeAddress(input: string): { address: string } | { error: string } {
  const text = input.trim();
  if (!text) return { error: "Enter an address." };
  const parsed = text.length <= OFFICE_ADDRESS_MAX_LENGTH ? parse(text) : null;
  if (!parsed) return { error: "Enter an IP address such as 203.0.113.8, or a range such as 203.0.113.8/30." };
  if (parsed.prefix === null || parsed.prefix === BITS[parsed.family]) return { address: parsed.address };
  if (parsed.prefix < MIN_PREFIX[parsed.family]) {
    return { error: `That range is too wide. Use /${MIN_PREFIX[parsed.family]} or narrower (a larger number).` };
  }
  const start = parsed.family === "ipv4" ? ipv4Network(parsed.address, parsed.prefix) : parsed.address;
  return { address: `${start}/${parsed.prefix}` };
}

// Whether an address (from the request) falls within any of the stored addresses or ranges.
export function isOfficeAddress(ip: string | null, addresses: readonly string[]): boolean {
  const request = ip ? normaliseIp(ip) : null;
  if (!request) return false;
  const list = new BlockList();
  for (const entry of addresses) {
    const parsed = parse(entry);
    if (!parsed) continue;
    if (parsed.prefix === null) list.addAddress(parsed.address, parsed.family);
    else list.addSubnet(parsed.address, parsed.prefix, parsed.family);
  }
  return list.check(request.address, request.family);
}

// Read at most once per request, and only for Admins.
export const loadOfficeNetwork = cache(async (): Promise<OfficeNetwork> => {
  const [{ rows: settings }, { rows: addresses }] = await Promise.all([
    pool.query<{ is_on: boolean }>(`select is_on from office_network`),
    pool.query<{ id: string; address: string; label: string; created_at: Date }>(
      `select id, address, label, created_at from office_network_addresses order by created_at, id`
    ),
  ]);
  return {
    isOn: settings[0]?.is_on ?? false,
    addresses: addresses.map((row) => ({ id: row.id, address: row.address, label: row.label, createdAt: row.created_at.toISOString() })),
  };
});

// True when this account may not use admin pages from this address. Only Admins who aren't exempt are ever limited.
export async function isOutsideOffice(account: { role: UserRole; office_exempt: boolean }, ip: string | null): Promise<boolean> {
  if (account.role !== "admin" || account.office_exempt) return false;
  const network = await loadOfficeNetwork();
  if (!network.isOn) return false;
  return !isOfficeAddress(ip, network.addresses.map((entry) => entry.address));
}
