import type { PoolClient } from "pg";
import { resolveMedia } from "@/lib/content/pages";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { checkAnswer, isOversizedResponse } from "@/lib/questions/check";
import { currentCategory, drawRandom, loadPool, loadQuestions } from "@/lib/questions/pool";
import { toClientQuestion } from "@/lib/questions/public";
import { drawMock } from "./draw";
import {
  MOCK_QUESTIONS,
  SAVE_GRACE_SECONDS,
  mockMinutes,
  type MockChange,
  type MockEnd,
  type MockHome,
  type MockRun,
  type MockSaveReply,
  type OpenMock,
} from "./types";

// Mock tests for the current category: answers saved as given, marked when the test ends; the deadline lives
// here, so time runs on when the candidate leaves. Not activity-log data (candidates' attempts, agreed 5 Oct).

// Tests that keep their questions and answers for review; older ones keep totals only.
const KEEP_ANSWERS = 10;
// A submit this close to the deadline counts as "time up" (the test screen submits itself at 0).
const TIME_UP_SECONDS = 5;

type Db = Pick<PoolClient, "query">;

type AttemptRow = {
  id: string;
  user_id: string;
  category_id: string;
  current_category_id: string;
  question_ids: string[];
  responses: unknown[];
  flags: string;
  position: number;
  total: number;
  ended_at: Date | null;
  seconds_left: number;
};

const ATTEMPT = `select a.id, a.user_id, a.category_id, u.current_category_id, a.question_ids, a.responses, a.flags, a.position,
                        a.total, a.ended_at, extract(epoch from a.deadline_at - now())::float8 as seconds_left
                 from mock_attempts a join users u on u.id = a.user_id`;

const isOverdue = (row: AttemptRow) => row.seconds_left < -SAVE_GRACE_SECONDS;
const secondsLeft = (row: AttemptRow) => Math.max(0, Math.floor(row.seconds_left));
const countAnswered = (responses: unknown[]) => responses.filter((response) => response !== null && response !== undefined).length;

// The candidate's test in progress, locked. One that ran out of time or belongs to a category they no
// longer work in is ended first (with what was saved) and null returned.
async function settleOpen(client: Db, userId: string): Promise<AttemptRow | null> {
  const { rows } = await client.query<AttemptRow>(`${ATTEMPT} where a.user_id = $1 and a.ended_at is null for update of a`, [userId]);
  const open = rows[0];
  if (!open) return null;
  if (isOverdue(open)) await finish(client, open, "away");
  else if (open.category_id !== open.current_category_id) await finish(client, open, "moved");
  else return open;
  return null;
}

const toOpen = (row: AttemptRow): OpenMock => ({ id: row.id, total: row.total, answered: countAnswered(row.responses), secondsLeft: secondsLeft(row) });

// --- Start page

export async function loadMockHome(userId: string): Promise<MockHome | null> {
  return withTransaction(async (client) => {
    const category = await currentCategory(client, userId);
    if (!category) return null;
    const open = await settleOpen(client, userId);
    const size = Math.min(MOCK_QUESTIONS, (await loadPool(client, "mock", category.id)).length);
    return { categoryName: category.name, size, minutes: size > 0 ? mockMinutes(size) : 0, open: open ? toOpen(open) : null };
  });
}

// Home card and the category page: the test in progress in the current category, read only.
export async function loadMockInProgress(userId: string): Promise<OpenMock | null> {
  const { rows } = await pool.query<AttemptRow>(
    `${ATTEMPT} where a.user_id = $1 and a.ended_at is null and a.category_id = u.current_category_id
       and a.deadline_at > now() - make_interval(secs => ${SAVE_GRACE_SECONDS})`,
    [userId]
  );
  return rows[0] ? toOpen(rows[0]) : null;
}

export type StartReply = { ok: true; id: string } | { ok: false; error: string };

// Starts a test, or returns the one already in progress (a second tap on Start lands in the same test).
export async function startMock(userId: string): Promise<StartReply> {
  return withTransaction(async (client): Promise<StartReply> => {
    await client.query(`select 1 from users where id = $1 for update`, [userId]);
    const category = await currentCategory(client, userId);
    if (!category) return { ok: false, error: "Your account isn’t available." };
    const open = await settleOpen(client, userId);
    if (open) return { ok: true, id: open.id };
    const questions = await loadPool(client, "mock", category.id);
    if (questions.length === 0) return { ok: false, error: `There are no mock test questions for ${category.name} yet.` };
    // The last test's questions come last in each chapter, so back-to-back tests differ where they can.
    const { rows: last } = await client.query<{ question_ids: string[] }>(
      `select question_ids from mock_attempts where user_id = $1 and category_id = $2 and ended_at is not null and question_ids is not null
       order by ended_at desc limit 1`,
      [userId, category.id]
    );
    const picked = drawMock(questions, MOCK_QUESTIONS, new Set(last[0]?.question_ids ?? []), drawRandom);
    const seconds = mockMinutes(picked.length) * 60;
    const { rows } = await client.query<{ id: string }>(
      `insert into mock_attempts (user_id, category_id, question_ids, responses, flags, total, duration_seconds, deadline_at)
       values ($1, $2, $3, $4, $5, $6, $7::int, now() + make_interval(secs => $7::int)) returning id`,
      [userId, category.id, picked.map((q) => q.id), JSON.stringify(picked.map(() => null)), ".".repeat(picked.length), picked.length, seconds]
    );
    return { ok: true, id: rows[0].id };
  });
}

// --- The test

export type MockView = { kind: "running"; run: MockRun } | { kind: "ended" } | { kind: "missing" };

export async function loadMockRun(userId: string, attemptId: string): Promise<MockView> {
  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query<AttemptRow>(`${ATTEMPT} where a.id = $1 and a.user_id = $2 for update of a`, [attemptId, userId]);
    const row = rows[0];
    if (!row) return { kind: "missing" as const };
    if (row.ended_at) return { kind: "ended" as const };
    if (isOverdue(row)) {
      await finish(client, row, "away");
      return { kind: "ended" as const };
    }
    if (row.category_id !== row.current_category_id) {
      await finish(client, row, "moved");
      return { kind: "ended" as const };
    }
    return { kind: "open" as const, row, questions: await loadQuestions(client, row.question_ids) };
  });
  if (outcome.kind !== "open") return outcome;
  const { row, questions } = outcome;
  // Exam mode: the answer and explanation never leave the server. A question deleted meanwhile is null.
  const list = row.question_ids.map((id) => {
    const question = questions.get(id);
    return question ? toClientQuestion({ ...question, id }, "exam") : null;
  });
  return {
    kind: "running",
    run: {
      attemptId: row.id,
      total: row.total,
      position: Math.min(row.position, row.total - 1),
      secondsLeft: secondsLeft(row),
      questions: list,
      responses: row.responses,
      flags: [...row.flags].map((flag) => flag === "F"),
      media: await resolveMedia([...questions.values()].flatMap((question) => question.mediaIds)),
    },
  };
}

const validPosition = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < MOCK_QUESTIONS;

// Untrusted input from the test screen, checked before anything is read.
export function parseChanges(changes: unknown): MockChange[] | null {
  if (!Array.isArray(changes) || changes.length > MOCK_QUESTIONS) return null;
  const parsed: MockChange[] = [];
  for (const raw of changes) {
    if (typeof raw !== "object" || raw === null) return null;
    const { position, response, flagged } = raw as Record<string, unknown>;
    if (!validPosition(position)) return null;
    if (flagged !== undefined && typeof flagged !== "boolean") return null;
    if (response !== undefined && isOversizedResponse(response)) return null;
    parsed.push({ position, ...(response !== undefined ? { response } : {}), ...(flagged !== undefined ? { flagged } : {}) });
  }
  return parsed;
}

// Saves answers and flags as given (unmarked), and the question on screen. Later changes win.
export async function saveMockAnswers(userId: string, attemptId: string, changes: MockChange[], position: number | null): Promise<MockSaveReply> {
  return withTransaction(async (client): Promise<MockSaveReply> => {
    const { rows } = await client.query<AttemptRow>(`${ATTEMPT} where a.id = $1 and a.user_id = $2 for update of a`, [attemptId, userId]);
    const row = rows[0];
    if (!row) return { ok: false, reason: "invalid" };
    if (row.ended_at) return { ok: false, reason: "ended" };
    if (isOverdue(row)) {
      await finish(client, row, "time_up");
      return { ok: false, reason: "ended" };
    }
    if (row.category_id !== row.current_category_id) {
      await finish(client, row, "moved");
      return { ok: false, reason: "ended" };
    }
    if (changes.some((change) => change.position >= row.total) || (position !== null && position >= row.total)) return { ok: false, reason: "invalid" };
    const responses = [...row.responses];
    const flags = [...row.flags];
    for (const change of changes) {
      if (change.response !== undefined) responses[change.position] = change.response ?? null;
      if (change.flagged !== undefined) flags[change.position] = change.flagged ? "F" : ".";
    }
    await client.query(`update mock_attempts set responses = $2, flags = $3, position = $4, updated_at = now() where id = $1`, [
      row.id,
      JSON.stringify(responses),
      flags.join(""),
      position ?? row.position,
    ]);
    return { ok: true, secondsLeft: secondsLeft(row) };
  });
}

// Ends the test with what was saved. Ending one that has already ended changes nothing.
export async function submitMock(userId: string, attemptId: string): Promise<"ended" | "missing"> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<AttemptRow>(`${ATTEMPT} where a.id = $1 and a.user_id = $2 for update of a`, [attemptId, userId]);
    const row = rows[0];
    if (!row) return "missing";
    if (!row.ended_at) await finish(client, row, row.seconds_left <= TIME_UP_SECONDS ? "time_up" : "submitted");
    return "ended";
  });
}

// Marks every answer, stores the totals, and trims older tests' answers. A test moved away from with
// nothing answered is simply removed.
async function finish(client: Db, row: AttemptRow, how: MockEnd) {
  if (how === "moved" && countAnswered(row.responses) === 0) {
    await client.query(`delete from mock_attempts where id = $1`, [row.id]);
    return;
  }
  const questions = await loadQuestions(client, row.question_ids);
  const summary: Record<string, [number, number]> = {};
  let marks = "";
  row.question_ids.forEach((id, index) => {
    const question = questions.get(id);
    const result = question ? checkAnswer(question, row.responses[index]) : null;
    if (!question || !result) {
      marks += "S";
      return;
    }
    marks += result.answered ? (result.correct ? "R" : "W") : "U";
    const entry = (summary[question.chapterId] ??= [0, 0]);
    if (result.correct) entry[0] += 1;
    entry[1] += 1;
  });
  const count = (mark: string) => [...marks].filter((m) => m === mark).length;
  await client.query(
    `update mock_attempts
     set ended_how = $2::varchar, marks = $3, answered = $4, right_count = $5, out_of = $6, chapter_summary = $7,
         ended_at = case when $2::varchar = 'away' then deadline_at else now() end,
         seconds_taken = case when $2::varchar = 'away' then duration_seconds
                              else least(duration_seconds, greatest(0, extract(epoch from now() - started_at)))::int end
     where id = $1`,
    [row.id, how, marks, count("R") + count("W"), count("R"), row.total - count("S"), JSON.stringify(summary)]
  );
  await client.query(
    `update mock_attempts set question_ids = null, responses = null, flags = null, marks = null
     where user_id = $1 and question_ids is not null and ended_at is not null and id not in (
       select id from mock_attempts where user_id = $1 and ended_at is not null order by ended_at desc, id limit ${KEEP_ANSWERS}
     )`,
    [row.user_id]
  );
}
