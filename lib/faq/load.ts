import { pool } from "@/lib/db/pool";
import type { FaqItem, SupportContact } from "./types";

// General queries: the questions in order, and the support contact details.

const EMPTY_CONTACT: SupportContact = { email: null, phone: null, hours: null, note: null };

export async function loadFaqItems(shownOnly: boolean): Promise<FaqItem[]> {
  const { rows } = await pool.query<FaqItem>(
    `select id, position, question, answer, status from faq_items ${shownOnly ? "where status = 'published'" : ""} order by position`
  );
  return rows;
}

export async function loadSupportContact(): Promise<SupportContact> {
  const { rows } = await pool.query<SupportContact>(`select email, phone, hours, note from support_contact`);
  return rows[0] ?? EMPTY_CONTACT;
}
