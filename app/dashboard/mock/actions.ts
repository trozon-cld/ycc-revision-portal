"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guard";
import { parseChanges, saveMockAnswers, startMock, submitMock } from "@/lib/mock/attempts";
import { MOCK_QUESTIONS, type MockSaveReply } from "@/lib/mock/types";
import { isUuid } from "@/lib/ids";

// Candidate mock tests. Not activity-log actions (agreed 5 Oct): they only touch the candidate's own rows.

export type MockStartState = { error: string | null };

export async function startMockForm(_prev: MockStartState): Promise<MockStartState> {
  const session = await requireRole(["candidate"]);
  const reply = await startMock(session.sub);
  if (!reply.ok) return { error: reply.error };
  redirect(`/dashboard/mock/${reply.id}`);
}

// Answers and flags changed since the last save, and the question on screen.
export async function saveMockProgress(attemptId: string, changes: unknown, position: unknown): Promise<MockSaveReply> {
  const session = await requireRole(["candidate"]);
  const parsed = parseChanges(changes);
  const onScreen = position === null || (Number.isInteger(position) && (position as number) >= 0 && (position as number) < MOCK_QUESTIONS) ? (position as number | null) : undefined;
  if (typeof attemptId !== "string" || !isUuid(attemptId) || !parsed || onScreen === undefined) return { ok: false, reason: "invalid" };
  return saveMockAnswers(session.sub, attemptId, parsed, onScreen);
}

export async function submitMockTest(attemptId: string): Promise<"ended" | "missing"> {
  const session = await requireRole(["candidate"]);
  if (typeof attemptId !== "string" || !isUuid(attemptId)) return "missing";
  return submitMock(session.sub, attemptId);
}
