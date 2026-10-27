import type { PoolClient } from "pg";
import { cache } from "react";
import { formatUkTime } from "@/lib/candidates/access";
import { resolveMedia } from "@/lib/content/pages";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { checkAnswer, isOversizedResponse } from "@/lib/questions/check";
import { NUMBERED, chapterLabel, currentTestType, drawRandom, loadPool, loadQuestions, type PoolQuestion } from "@/lib/questions/pool";
import { toClientQuestion } from "@/lib/questions/public";
import { drawMock } from "./draw";
import { nextStep, weakestTopics, type TopicResult } from "./results";
import {
  MOCK_KEEP_ANSWERS,
  MOCK_QUESTIONS,
  MOCK_STARTS_PER_HOUR,
  READINESS_TARGET,
  SAVE_GRACE_SECONDS,
  mockMinutes,
  type MockChange,
  type MockEnd,
  type MockHome,
  type MockRun,
  type MockSaveReply,
  type MockHistory,
  type MockHistoryEntry,
  type MockResults,
  type MockReview,
  type MockReviewItem,
  type OpenMock,
} from "./types";

// Mock tests for the current test type: answers saved as given, marked when the test ends; the deadline lives
// here, so time runs on when the candidate leaves. Not activity-log data (candidates' attempts, agreed 5 Oct).

// A submit this close to the deadline counts as "time up" (the test screen submits itself at 0).
const TIME_UP_SECONDS = 5;

type Db = Pick<PoolClient, "query">;

type AttemptRow = {
  id: string;
  user_id: string;
  test_type_id: string;
  current_test_type_id: string;
  question_ids: string[];
  responses: unknown[];
  flags: string;
  position: number;
  total: number;
  ended_at: Date | null;
  seconds_left: number;
};

const ATTEMPT = `select a.id, a.user_id, a.test_type_id, u.current_test_type_id, a.question_ids, a.responses, a.flags, a.position,
                        a.total, a.ended_at, extract(epoch from a.deadline_at - now())::float8 as seconds_left
                 from mock_attempts a join users u on u.id = a.user_id`;

const isOverdue = (row: AttemptRow) => row.seconds_left < -SAVE_GRACE_SECONDS;
const secondsLeft = (row: AttemptRow) => Math.max(0, Math.floor(row.seconds_left));
const countAnswered = (responses: unknown[]) => responses.filter((response) => response !== null && response !== undefined).length;

// The candidate's test in progress, locked. One that ran out of time or belongs to a test type they no
// longer work in is ended first (with what was saved) and null returned.
async function settleOpen(client: Db, userId: string): Promise<AttemptRow | null> {
  const { rows } = await client.query<AttemptRow>(`${ATTEMPT} where a.user_id = $1 and a.ended_at is null for update of a`, [userId]);
  const open = rows[0];
  if (!open) return null;
  if (isOverdue(open)) await finish(client, open, "away");
  else if (open.test_type_id !== open.current_test_type_id) await finish(client, open, "moved");
  else return open;
  return null;
}

// Open tests that have run out of time, or whose test type the candidate no longer works in.
export const STALE_MOCK_SQL = `a.ended_at is null and (a.deadline_at < now() - make_interval(secs => ${SAVE_GRACE_SECONDS}) or a.test_type_id <> u.current_test_type_id)`;

// Ends these candidates' stale tests, as their own pages would, so staff see every test. Call inside a transaction.
export async function settleMocks(db: Db, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const { rows } = await db.query<AttemptRow>(`${ATTEMPT} where a.user_id = any($1::uuid[]) and ${STALE_MOCK_SQL} order by a.id for update of a`, [userIds]);
  for (const row of rows) await finish(db, row, isOverdue(row) ? "away" : "moved");
}

// The candidate's own pages (Home, My progress): a test that ran out while they were away ends first,
// so they see the same last score and readiness as staff do.
export async function settleOwnMocks(userId: string): Promise<void> {
  await withTransaction((client) => settleMocks(client, [userId]));
}

const toOpen = (row: AttemptRow): OpenMock => ({ id: row.id, total: row.total, answered: countAnswered(row.responses), secondsLeft: secondsLeft(row) });

// --- Start page

export async function loadMockHome(userId: string): Promise<MockHome | null> {
  return withTransaction(async (client) => {
    const testType = await currentTestType(client, userId);
    if (!testType) return null;
    const open = await settleOpen(client, userId);
    const size = Math.min(MOCK_QUESTIONS, (await loadPool(client, "mock", testType.id)).length);
    return { testTypeName: testType.name, size, minutes: size > 0 ? mockMinutes(size) : 0, open: open ? toOpen(open) : null };
  });
}

// Home card and the test type page: the test in progress in the current test type, read only.
export async function loadMockInProgress(userId: string): Promise<OpenMock | null> {
  const { rows } = await pool.query<AttemptRow>(
    `${ATTEMPT} where a.user_id = $1 and a.ended_at is null and a.test_type_id = u.current_test_type_id
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
    const testType = await currentTestType(client, userId);
    if (!testType) return { ok: false, error: "Your account isn’t available." };
    const open = await settleOpen(client, userId);
    if (open) return { ok: true, id: open.id };
    const { rows: recent } = await client.query<{ started_at: Date }>(
      `select started_at from mock_attempts where user_id = $1 and started_at > now() - interval '1 hour'
       order by started_at desc limit ${MOCK_STARTS_PER_HOUR}`,
      [userId]
    );
    if (recent.length >= MOCK_STARTS_PER_HOUR) {
      const nextAt = recent[MOCK_STARTS_PER_HOUR - 1].started_at.getTime() + 60 * 60 * 1000;
      return { ok: false, error: `You’ve started ${MOCK_STARTS_PER_HOUR} mock tests in the last hour. You can start another at ${formatUkTime(new Date(nextAt))}.` };
    }
    const questions = await loadPool(client, "mock", testType.id);
    if (questions.length === 0) return { ok: false, error: `There are no mock test questions for ${testType.name} yet.` };
    // The last test's questions come last in each chapter, so back-to-back tests differ where they can.
    const { rows: last } = await client.query<{ question_ids: string[] }>(
      `select question_ids from mock_attempts where user_id = $1 and test_type_id = $2 and ended_at is not null and question_ids is not null
       order by ended_at desc limit 1`,
      [userId, testType.id]
    );
    const picked = drawMock(questions, MOCK_QUESTIONS, new Set(last[0]?.question_ids ?? []), drawRandom);
    const seconds = mockMinutes(picked.length) * 60;
    const { rows } = await client.query<{ id: string }>(
      `insert into mock_attempts (user_id, test_type_id, question_ids, responses, flags, total, duration_seconds, deadline_at)
       values ($1, $2, $3, $4, $5, $6, $7::int, now() + make_interval(secs => $7::int)) returning id`,
      [userId, testType.id, picked.map((q) => q.id), JSON.stringify(picked.map(() => null)), ".".repeat(picked.length), picked.length, seconds]
    );
    return { ok: true, id: rows[0].id };
  });
}

// --- The test

export type MockView = { kind: "running"; run: MockRun } | { kind: "ended" } | { kind: "missing" };

// Once per request: the page and its title both ask.
export const loadMockRun = cache(readMockRun);

async function readMockRun(userId: string, attemptId: string): Promise<MockView> {
  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query<AttemptRow>(`${ATTEMPT} where a.id = $1 and a.user_id = $2 for update of a`, [attemptId, userId]);
    const row = rows[0];
    if (!row) return { kind: "missing" as const };
    if (row.ended_at) return { kind: "ended" as const };
    if (isOverdue(row)) {
      await finish(client, row, "away");
      return { kind: "ended" as const };
    }
    if (row.test_type_id !== row.current_test_type_id) {
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

// The candidate's own ended test, with results by chapter (from the totals every test keeps).
export async function loadMockResults(userId: string, attemptId: string): Promise<MockResults | null> {
  const { rows } = await pool.query<{
    ended_how: MockEnd;
    right_count: number;
    out_of: number;
    answered: number;
    total: number;
    seconds_taken: number;
    chapter_summary: Record<string, [number, number]> | null;
    same_test_type: boolean;
    kept: boolean;
    test_type_id: string;
    question_ids: string[] | null;
    marks: string | null;
  }>(
    `select a.ended_how, a.right_count, a.out_of, a.answered, a.total, a.seconds_taken, a.chapter_summary,
            a.test_type_id = u.current_test_type_id as same_test_type, a.question_ids is not null as kept,
            a.test_type_id, a.question_ids, a.marks
     from mock_attempts a join users u on u.id = a.user_id
     where a.id = $1 and a.user_id = $2 and a.ended_at is not null`,
    [attemptId, userId]
  );
  const row = rows[0];
  if (!row) return null;
  const summary = row.chapter_summary ?? {};
  const { rows: chapters } = await pool.query<{ id: string; title: string; number: number }>(
    `with ${NUMBERED} select id, title, number from numbered where id = any($1::uuid[]) order by number`,
    [Object.keys(summary)]
  );
  const known = new Set(chapters.map((chapter) => chapter.id));
  const topics: TopicResult[] = [
    ...chapters.map((chapter) => ({ id: chapter.id, label: chapterLabel(chapter), right: summary[chapter.id][0], outOf: summary[chapter.id][1] })),
    // A chapter deleted since the test still counts in the score.
    ...Object.keys(summary)
      .filter((id) => !known.has(id))
      .map((id) => ({ id, label: "A chapter no longer in the Handbook", right: summary[id][0], outOf: summary[id][1] })),
  ];
  const weakest = weakestTopics(topics.filter((topic) => known.has(topic.id)));
  const share = row.out_of > 0 ? row.right_count / row.out_of : 0;
  return {
    how: row.ended_how,
    rightCount: row.right_count,
    outOf: row.out_of,
    answered: row.answered,
    total: row.total,
    secondsTaken: row.seconds_taken,
    topics,
    weakest,
    next: nextStep(weakest, share, READINESS_TARGET, row.same_test_type),
    answersKept: row.kept,
    practiceCount: row.same_test_type ? (await missedInPractice(pool, row.test_type_id, missedIds(row))).length : 0,
  };
}

const missedIds = (row: { question_ids: string[] | null; marks: string | null }) =>
  (row.question_ids ?? []).filter((_, index) => row.marks?.[index] === "W" || row.marks?.[index] === "U");

const missedInPractice = async (db: Db, testTypeId: string, ids: string[]) =>
  ids.length === 0 ? [] : (await loadPool(db, "practice", testTypeId)).filter((question) => ids.includes(question.id));

// For "Practise the questions you missed": the candidate's own ended test (answers kept) in their current
// test type, and its wrong or unanswered questions that are in Practice now.
export async function mockMissesForPractice(db: Db, userId: string, attemptId: string): Promise<{ testTypeId: string; questions: PoolQuestion[] } | null> {
  const { rows } = await db.query<{ test_type_id: string; question_ids: string[]; marks: string }>(
    `select a.test_type_id, a.question_ids, a.marks from mock_attempts a join users u on u.id = a.user_id
     where a.id = $1 and a.user_id = $2 and a.ended_at is not null and a.question_ids is not null and a.test_type_id = u.current_test_type_id`,
    [attemptId, userId]
  );
  const row = rows[0];
  if (!row) return null;
  return { testTypeId: row.test_type_id, questions: await missedInPractice(db, row.test_type_id, missedIds(row)) };
}

type HistoryRow = { id: string; ended_at: Date; ended_how: MockEnd; right_count: number; out_of: number; seconds_taken: number };
const toEntry = (row: HistoryRow): MockHistoryEntry => ({
  id: row.id,
  endedAt: row.ended_at.toISOString(),
  how: row.ended_how,
  rightCount: row.right_count,
  outOf: row.out_of,
  secondsTaken: row.seconds_taken,
});

// Ended tests in one test type (current unless given), newest first (`limit` from `offset`), with count, best and average.
export async function loadMockHistory(userId: string, limit: number, options: { testTypeId?: string; offset?: number } = {}): Promise<MockHistory> {
  const scope = `from mock_attempts a join users u on u.id = a.user_id
                 where a.user_id = $1 and a.ended_at is not null and a.test_type_id = coalesce($2::uuid, u.current_test_type_id)`;
  const columns = `a.id, a.ended_at, a.ended_how, a.right_count, a.out_of, a.seconds_taken`;
  const scopeValues = [userId, options.testTypeId ?? null];
  const [items, best, count] = await Promise.all([
    pool.query<HistoryRow>(`select ${columns} ${scope} order by a.ended_at desc, a.id limit $3 offset $4`, [...scopeValues, limit, options.offset ?? 0]),
    pool.query<HistoryRow>(
      `select ${columns} ${scope} order by a.right_count::float8 / nullif(a.out_of, 0) desc nulls last, a.ended_at desc limit 1`,
      scopeValues
    ),
    pool.query<{ count: number; average: number | null }>(
      `select count(*)::int as count, avg(a.right_count::float8 / nullif(a.out_of, 0)) as average ${scope}`,
      scopeValues
    ),
  ]);
  const average = count.rows[0].average;
  return {
    count: count.rows[0].count,
    best: best.rows[0] ? toEntry(best.rows[0]) : null,
    items: items.rows.map(toEntry),
    average,
    averagePercent: average === null ? null : Math.round(average * 100),
  };
}

// The candidate's own ended test, question by question with answers. Never for a test still running.
export async function loadMockReview(userId: string, attemptId: string): Promise<MockReview | null> {
  const { rows } = await pool.query<{
    question_ids: string[] | null;
    responses: unknown[] | null;
    flags: string | null;
    marks: string | null;
    total: number;
    test_type_id: string;
    same_test_type: boolean;
  }>(
    `select a.question_ids, a.responses, a.flags, a.marks, a.total, a.test_type_id, a.test_type_id = u.current_test_type_id as same_test_type
     from mock_attempts a join users u on u.id = a.user_id
     where a.id = $1 and a.user_id = $2 and a.ended_at is not null`,
    [attemptId, userId]
  );
  const row = rows[0];
  if (!row) return null;
  if (!row.question_ids || !row.responses || !row.flags || !row.marks) return { kept: false, total: row.total, items: [], media: {} };
  const ids = row.question_ids;
  const questions = await loadQuestions(pool, ids);
  // Practice flags only for questions in the current test type's Practice (as on the Practice report).
  const inPractice = new Set<string>();
  const flagged = new Set<string>();
  if (row.same_test_type) {
    (await loadPool(pool, "practice", row.test_type_id)).forEach((question) => inPractice.add(question.id));
    const { rows: flags } = await pool.query<{ question_id: string }>(
      `select question_id from question_flags where user_id = $1 and test_type_id = $2 and question_id = any($3::uuid[])`,
      [userId, row.test_type_id, ids]
    );
    flags.forEach((flag) => flagged.add(flag.question_id));
  }
  const items: MockReviewItem[] = [];
  ids.forEach((id, position) => {
    const question = questions.get(id);
    const mark = row.marks?.[position];
    if (!question || (mark !== "R" && mark !== "W" && mark !== "U")) return;
    items.push({
      position,
      mark,
      flaggedInTest: row.flags?.[position] === "F",
      chapterLabel: question.chapterLabel,
      question: toClientQuestion({ ...question, id }, "practice"),
      response: row.responses?.[position] ?? null,
      answer: question.answer,
      explanation: question.explanation,
      practiceFlag: inPractice.has(id) ? flagged.has(id) : null,
    });
  });
  return { kept: true, total: row.total, items, media: await resolveMedia([...questions.values()].flatMap((question) => question.mediaIds)) };
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
    // Overdue means nothing reached us for a while (asleep, offline or closed): time ran out while away.
    if (isOverdue(row)) {
      await finish(client, row, "away");
      return { ok: false, reason: "ended" };
    }
    if (row.test_type_id !== row.current_test_type_id) {
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
    if (!row.ended_at) await finish(client, row, isOverdue(row) ? "away" : row.seconds_left <= TIME_UP_SECONDS ? "time_up" : "submitted");
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
         ended_at = case when $2::varchar = 'away' then deadline_at else least(now(), deadline_at) end,
         seconds_taken = case when $2::varchar = 'away' then duration_seconds
                              else least(duration_seconds, greatest(0, extract(epoch from least(now(), deadline_at) - started_at)))::int end
     where id = $1`,
    [row.id, how, marks, count("R") + count("W"), count("R"), row.total - count("S"), JSON.stringify(summary)]
  );
  await client.query(
    `update mock_attempts set question_ids = null, responses = null, flags = null, marks = null
     where user_id = $1 and question_ids is not null and ended_at is not null and id not in (
       select id from mock_attempts where user_id = $1 and ended_at is not null order by ended_at desc, id limit ${MOCK_KEEP_ANSWERS}
     )`,
    [row.user_id]
  );
}
