"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { checkOfficeAddress } from "@/lib/auth/office-network";
import { logActivity } from "@/lib/audit/log";
import { getErrorCode, withTransaction } from "@/lib/db/transaction";
import type { FormState } from "@/lib/forms";
import { isUuid } from "@/lib/ids";
import { OFFICE_ADDRESS_MAX_COUNT, OFFICE_LABEL_MAX_LENGTH } from "@/lib/limits";
import { cleanLine } from "@/lib/text";

export type OfficeNetworkActionState = FormState;

const TARGET = { type: "office_network", id: null, label: "Office network" } as const;
const MISSING = "The office network settings are missing. Please run the latest database migration.";

// Turns the check on ("true") or off ("false"). It can't be on with no addresses.
export async function setOfficeNetworkOn(_prevState: OfficeNetworkActionState, formData: FormData): Promise<OfficeNetworkActionState> {
  const session = await requireRole(["superadmin"]);
  const value = formData.get("on");
  if (value !== "true" && value !== "false") return { error: "Something went wrong. Please try again." };
  const on = value === "true";

  const result = await withTransaction<OfficeNetworkActionState>(async (client) => {
    const settings = await lockSettings(client);
    if (!settings) return { error: MISSING };
    if (settings.is_on === on) return { success: true };
    if (on && (await countAddresses(client)) === 0) return { error: "Add at least one office address first." };

    await client.query(`update office_network set is_on = $1, updated_at = now()`, [on]);
    await logActivity(client, session, "office_network.changed", TARGET, { from: on ? "Off" : "On", to: on ? "On" : "Off" });
    return { success: true };
  });

  revalidateOfficePages();
  return result;
}

export async function addOfficeAddress(_prevState: OfficeNetworkActionState, formData: FormData): Promise<OfficeNetworkActionState> {
  const session = await requireRole(["superadmin"]);
  const checked = checkOfficeAddress(cleanLine(formData.get("address")));
  if ("error" in checked) return checked;
  const label = cleanLine(formData.get("label"));
  if (!label) return { error: "Enter a label, such as the office or line it belongs to." };
  if (label.length > OFFICE_LABEL_MAX_LENGTH) return { error: `Label must be ${OFFICE_LABEL_MAX_LENGTH} characters or fewer.` };

  try {
    const result = await withTransaction<OfficeNetworkActionState>(async (client) => {
      if (!(await lockSettings(client))) return { error: MISSING };
      if ((await countAddresses(client)) >= OFFICE_ADDRESS_MAX_COUNT) {
        return { error: `You can add up to ${OFFICE_ADDRESS_MAX_COUNT} addresses. Remove one first.` };
      }
      const { rows } = await client.query<{ id: string }>(
        `insert into office_network_addresses (address, label) values ($1, $2) returning id`,
        [checked.address, label]
      );
      await logActivity(client, session, "office_network.address_added", { ...TARGET, id: rows[0].id, label: checked.address }, { address: checked.address, label });
      return { success: true };
    });
    revalidateOfficePages();
    return result;
  } catch (error) {
    if (getErrorCode(error) === "23505") return { error: `${checked.address} is already on the list.` };
    throw error;
  }
}

// The last address can't go while the check is on (no Admin could get in).
export async function removeOfficeAddress(_prevState: OfficeNetworkActionState, formData: FormData): Promise<OfficeNetworkActionState> {
  const session = await requireRole(["superadmin"]);
  const id = formData.get("addressId");
  if (!isUuid(id)) return { error: "This address has already been removed." };

  const result = await withTransaction<OfficeNetworkActionState>(async (client) => {
    const settings = await lockSettings(client);
    if (!settings) return { error: MISSING };
    const { rows } = await client.query<{ address: string; label: string }>(
      `select address, label from office_network_addresses where id = $1`,
      [id]
    );
    if (!rows[0]) return { error: "This address has already been removed." };
    if (settings.is_on && (await countAddresses(client)) <= 1) {
      return { error: "This is the only address. Turn the office network check off first, or add another address." };
    }
    await client.query(`delete from office_network_addresses where id = $1`, [id]);
    await logActivity(client, session, "office_network.address_removed", { ...TARGET, id, label: rows[0].address }, { address: rows[0].address, label: rows[0].label });
    return { success: true };
  });

  revalidateOfficePages();
  return result;
}

// Every change takes this lock first, so the on/off rule and the address limit can't be raced.
async function lockSettings(client: PoolClient) {
  const { rows } = await client.query<{ is_on: boolean }>(`select is_on from office_network for update`);
  return rows[0];
}

async function countAddresses(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ count: number }>(`select count(*)::int as count from office_network_addresses`);
  return rows[0].count;
}

function revalidateOfficePages() {
  revalidatePath("/admin/office-network");
  revalidatePath("/admin/admins");
}
