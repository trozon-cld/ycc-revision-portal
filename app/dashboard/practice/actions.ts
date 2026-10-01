"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { isUuid } from "@/lib/content/pages";
import { checkPractice, endPractice, nextPractice, setFlag, startPractice, startRetry } from "@/lib/practice/sessions";
import { isPracticeWay, type PracticeCheckReply, type PracticeNextReply } from "@/lib/practice/types";

// Candidate practice runs. Not activity-log actions (agreed 1 Oct): they only touch the candidate's own rows.

export type StartState = { error: string | null };

const MAX_CHOICES = 200;
const validPosition = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < 2000;

export async function startPracticeForm(_prev: StartState, formData: FormData): Promise<StartState> {
  const session = await requireRole(["candidate"]);
  const way = formData.get("way");
  if (!isPracticeWay(way)) return { error: "Choose what you'd like to practise." };
  const field = way === "chapters" ? "chapter" : way === "types" ? "type" : null;
  const choices = field ? formData.getAll(field).map(String).slice(0, MAX_CHOICES) : [];
  if (way === "chapters" && !choices.every(isUuid)) return { error: "Choose at least one chapter." };
  const sizeValue = String(formData.get("size") ?? "");
  const size = sizeValue === "all" ? "all" : Number(sizeValue);

  const reply = await startPractice(session.sub, { way, choices, size });
  if (!reply.ok) return { error: reply.error };
  redirect(`/dashboard/practice/${reply.id}`);
}

// "Practise these again" on a report.
export async function practiseAgain(formData: FormData): Promise<void> {
  const session = await requireRole(["candidate"]);
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!isUuid(sessionId)) redirect("/dashboard/practice");
  const reply = await startRetry(session.sub, sessionId);
  redirect(reply.ok ? `/dashboard/practice/${reply.id}` : `/dashboard/practice/${sessionId}?again=unavailable`);
}

export async function checkPracticeAnswer(sessionId: string, position: number, response: unknown): Promise<PracticeCheckReply> {
  const session = await requireRole(["candidate"]);
  if (typeof sessionId !== "string" || !isUuid(sessionId) || !validPosition(position)) return { ok: false, reason: "invalid" };
  return checkPractice(session.sub, sessionId, position, response);
}

export async function nextPracticeQuestion(sessionId: string, position: number): Promise<PracticeNextReply> {
  const session = await requireRole(["candidate"]);
  if (typeof sessionId !== "string" || !isUuid(sessionId) || !validPosition(position)) return { ok: false, reason: "moved" };
  return nextPractice(session.sub, sessionId, position);
}

export async function endPracticeRun(sessionId: string): Promise<"finished" | "removed" | "missing"> {
  const session = await requireRole(["candidate"]);
  if (typeof sessionId !== "string" || !isUuid(sessionId)) return "missing";
  return endPractice(session.sub, sessionId);
}

// Flag for review on or off. Returns the saved state, or null if the question can't be flagged now.
export async function setQuestionFlag(questionId: string, flagged: boolean): Promise<boolean | null> {
  const session = await requireRole(["candidate"]);
  if (typeof questionId !== "string" || !isUuid(questionId) || typeof flagged !== "boolean") return null;
  return setFlag(session.sub, questionId, flagged);
}
