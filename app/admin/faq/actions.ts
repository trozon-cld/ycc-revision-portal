"use server";

import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guard";
import { withTransaction } from "@/lib/db/transaction";
import { logActivity } from "@/lib/audit/log";
import { SUPPORT_FIELDS, type SupportContact } from "@/lib/faq/types";
import { isUuid } from "@/lib/ids";
import {
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_MAX_ITEMS,
  FAQ_QUESTION_MAX_LENGTH,
  SUPPORT_EMAIL_MAX_LENGTH,
  SUPPORT_HOURS_MAX_LENGTH,
  SUPPORT_NOTE_MAX_LENGTH,
  SUPPORT_PHONE_MAX_LENGTH,
} from "@/lib/limits";
import { cleanLine, cleanText } from "@/lib/text";
import { EMAIL_PATTERN } from "@/lib/users/credentials";
import type { FormState } from "@/lib/forms";

export type FaqActionState = FormState;

const NOT_FOUND = "This question no longer exists.";

export async function createFaq(_prevState: FaqActionState, formData: FormData): Promise<FaqActionState> {
  const session = await requireRole(["superadmin"]);
  const fields = readFaq(formData);
  if ("error" in fields) return fields;

  const result = await withTransaction<FaqActionState>(async (client) => {
    await lockFaqOrder(client);
    const { rows: counts } = await client.query<{ count: number }>(`select count(*)::int as count from faq_items`);
    if (counts[0].count >= FAQ_MAX_ITEMS) return { error: `You can have up to ${FAQ_MAX_ITEMS} questions.` };

    const { rows } = await client.query<{ id: string }>(
      `insert into faq_items (position, question, answer)
       select coalesce(max(position), 0) + 1, $1, $2 from faq_items
       returning id`,
      [fields.question, fields.answer]
    );
    await logActivity(client, session, "faq.created", { type: "faq", id: rows[0].id, label: fields.question });
    return { success: true };
  });

  revalidateFaqPages();
  return result;
}

export async function updateFaq(_prevState: FaqActionState, formData: FormData): Promise<FaqActionState> {
  const session = await requireRole(["superadmin"]);
  const id = formData.get("faqId");
  if (!isUuid(id)) return { error: NOT_FOUND };
  const fields = readFaq(formData);
  if ("error" in fields) return fields;

  const result = await withTransaction<FaqActionState>(async (client) => {
    const { rows } = await client.query<{ question: string; answer: string }>(
      `select question, answer from faq_items where id = $1 for update`,
      [id]
    );
    if (!rows[0]) return { error: NOT_FOUND };
    const changed = [rows[0].question !== fields.question && "Question", rows[0].answer !== fields.answer && "Answer"].filter(Boolean);
    if (changed.length === 0) return { success: true };

    await client.query(`update faq_items set question = $2, answer = $3, updated_at = now() where id = $1`, [id, fields.question, fields.answer]);
    const details: Record<string, string> = { changed: changed.join(", ") };
    if (rows[0].question !== fields.question) Object.assign(details, { from: rows[0].question, to: fields.question });
    await logActivity(client, session, "faq.updated", { type: "faq", id, label: fields.question }, details);
    return { success: true };
  });

  revalidateFaqPages();
  return result;
}

export async function moveFaq(id: string, direction: "up" | "down"): Promise<FaqActionState> {
  const session = await requireRole(["superadmin"]);
  if (!isUuid(id)) return { error: NOT_FOUND };
  if (direction !== "up" && direction !== "down") return { error: "Unknown direction." };

  const result = await withTransaction<FaqActionState>(async (client) => {
    await lockFaqOrder(client);
    const { rows } = await client.query<{ position: number; question: string }>(
      `select position, question from faq_items where id = $1`,
      [id]
    );
    if (!rows[0]) return { error: NOT_FOUND };

    const from = rows[0].position;
    const to = direction === "up" ? from - 1 : from + 1;
    const { rows: neighbours } = await client.query<{ id: string }>(`select id from faq_items where position = $1`, [to]);
    if (!neighbours[0]) return { error: direction === "up" ? "This question is already first." : "This question is already last." };

    await client.query(
      `update faq_items set position = case when id = $1 then $3::int else $4::int end, updated_at = now() where id in ($1, $2)`,
      [id, neighbours[0].id, to, from]
    );
    await logActivity(
      client,
      session,
      "faq.reordered",
      { type: "faq", id, label: rows[0].question },
      { from: `Position ${from}`, to: `Position ${to}` }
    );
    return { success: true };
  });

  revalidateFaqPages();
  return result;
}

// Show (published) or hide (draft) a question for candidates.
export async function setFaqShown(id: string, shown: boolean): Promise<FaqActionState> {
  const session = await requireRole(["superadmin"]);
  if (!isUuid(id) || typeof shown !== "boolean") return { error: NOT_FOUND };
  const status = shown ? "published" : "draft";

  const result = await withTransaction<FaqActionState>(async (client) => {
    const { rows } = await client.query<{ question: string; status: string }>(
      `select question, status from faq_items where id = $1 for update`,
      [id]
    );
    if (!rows[0]) return { error: NOT_FOUND };
    if (rows[0].status === status) return { success: true };

    await client.query(`update faq_items set status = $2, updated_at = now() where id = $1`, [id, status]);
    await logActivity(client, session, shown ? "faq.published" : "faq.unpublished", { type: "faq", id, label: rows[0].question });
    return { success: true };
  });

  revalidateFaqPages();
  return result;
}

export async function deleteFaq(_prevState: FaqActionState, formData: FormData): Promise<FaqActionState> {
  const session = await requireRole(["superadmin"]);
  const id = formData.get("faqId");
  if (!isUuid(id)) return { error: NOT_FOUND };

  const result = await withTransaction<FaqActionState>(async (client) => {
    await lockFaqOrder(client);
    const { rows } = await client.query<{ position: number; question: string }>(
      `delete from faq_items where id = $1 returning position, question`,
      [id]
    );
    if (!rows[0]) return { error: "This question has already been deleted." };

    await client.query(`update faq_items set position = position - 1, updated_at = now() where position > $1`, [rows[0].position]);
    await logActivity(client, session, "faq.deleted", { type: "faq", id, label: rows[0].question });
    return { success: true };
  });

  revalidateFaqPages();
  return result;
}

export async function saveSupportContact(_prevState: FaqActionState, formData: FormData): Promise<FaqActionState> {
  const session = await requireRole(["superadmin"]);
  const contact: SupportContact = {
    email: cleanLine(formData.get("email")) || null,
    phone: cleanLine(formData.get("phone")) || null,
    hours: cleanLine(formData.get("hours")) || null,
    note: cleanText(formData.get("note")) || null,
  };
  const invalid = validateContact(contact);
  if (invalid) return { error: invalid };

  const result = await withTransaction<FaqActionState>(async (client) => {
    const { rows } = await client.query<SupportContact>(`select email, phone, hours, note from support_contact for update`);
    const before = rows[0];
    if (!before) return { error: "Support contact details are missing. Please run the latest database migration." };
    const changed = SUPPORT_FIELDS.filter((field) => before[field.key] !== contact[field.key]).map((field) => field.label);
    if (changed.length === 0) return { success: true };

    await client.query(
      `update support_contact set email = $1, phone = $2, hours = $3, note = $4, updated_at = now()`,
      [contact.email, contact.phone, contact.hours, contact.note]
    );
    await logActivity(client, session, "support_contact.changed", { type: "support_contact", id: null, label: "Support contact details" }, { changed: changed.join(", ") });
    return { success: true };
  });

  revalidateFaqPages();
  return result;
}

// Serialises changes to the order; reads are not blocked.
async function lockFaqOrder(client: PoolClient) {
  await client.query(`lock table faq_items in share row exclusive mode`);
}

function readFaq(formData: FormData): { question: string; answer: string } | { error: string } {
  const question = cleanLine(formData.get("question"));
  const answer = cleanText(formData.get("answer"));
  if (!question) return { error: "Question is required." };
  if (question.length > FAQ_QUESTION_MAX_LENGTH) return { error: `Question must be ${FAQ_QUESTION_MAX_LENGTH} characters or fewer.` };
  if (!answer) return { error: "Answer is required." };
  if (answer.length > FAQ_ANSWER_MAX_LENGTH) return { error: `Answer must be ${FAQ_ANSWER_MAX_LENGTH} characters or fewer.` };
  return { question, answer };
}

const PHONE_PATTERN = /^\+?[0-9 ()-]{6,}$/;

function validateContact(contact: SupportContact): string | null {
  if (contact.email && (contact.email.length > SUPPORT_EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(contact.email))) return "Enter a valid email address.";
  if (contact.phone && (contact.phone.length > SUPPORT_PHONE_MAX_LENGTH || !PHONE_PATTERN.test(contact.phone))) {
    return "Enter a valid phone number (digits, spaces, brackets, dashes and a leading +).";
  }
  if (contact.hours && contact.hours.length > SUPPORT_HOURS_MAX_LENGTH) return `Opening hours must be ${SUPPORT_HOURS_MAX_LENGTH} characters or fewer.`;
  if (contact.note && contact.note.length > SUPPORT_NOTE_MAX_LENGTH) return `Note must be ${SUPPORT_NOTE_MAX_LENGTH} characters or fewer.`;
  return null;
}

function revalidateFaqPages() {
  revalidatePath("/admin/faq");
  revalidatePath("/dashboard/help");
}
