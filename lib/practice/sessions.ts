import type { PoolClient } from "pg";
import type { ResolvedMedia } from "@/lib/content/book";
import { resolveMedia } from "@/lib/content/pages";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { sectionLetter } from "@/lib/handbook/structure";
import { recordQuestionResult } from "@/lib/progress/question-results";
import { checkAnswer, isOversizedResponse } from "@/lib/questions/check";
import { shuffle } from "@/lib/questions/shuffle";
import { NUMBERED, chapterLabel, currentCategory, drawRandom as random, inPool, loadPool, loadQuestions, type LoadedQuestion, type PoolQuestion } from "@/lib/questions/pool";
import { toClientQuestion, type ClientQuestion } from "@/lib/questions/public";
import { availableQuestionTypes } from "@/lib/questions/registry";
import { isQuestionType, type QuestionType } from "@/lib/questions/types";
import {
  isFlagged,
  isUnseen,
  isWrong,
  smartPick,
  spreadOrder,
  spreadPick,
  weakChapters,
  weakPick,
  type PracticeHistory,
} from "./pick";
import {
  MAX_QUESTIONS,
  PRACTICE_SIZES,
  PRACTICE_TYPE_NAMES,
  WEAK_BELOW,
  WEAK_MIN_ANSWERED,
  type PracticeCheckReply,
  type PracticeChecked,
  type PracticeMode,
  type PracticeNextReply,
  type PracticeOptions,
  type PracticeStep,
  type PracticeWay,
} from "./types";

// Practice runs for the candidate's current category. Answers are marked here and recorded in
// question_results; nothing goes to the activity log (agreed 1 Oct).

// Finished runs kept per candidate (totals only, except the latest).
const KEEP_FINISHED = 20;
// Breaks longer than this don't count as time spent.
const MAX_GAP_SECONDS = 300;
const LOOK_AHEAD = 10;

type Db = Pick<PoolClient, "query">;

// Practice results and flags in this category, by question.
async function loadHistory(db: Db, userId: string, categoryId: string): Promise<Map<string, PracticeHistory>> {
  const { rows } = await db.query<{ question_id: string; tries: number; right: number; last_right: boolean | null; flagged: boolean }>(
    `select coalesce(r.question_id, f.question_id) as question_id, coalesce(r.practice_tries, 0)::int as tries,
            coalesce(r.practice_right, 0)::int as right, r.practice_last_right as last_right, f.question_id is not null as flagged
     from (select * from question_results where user_id = $1 and category_id = $2 and practice_tries > 0) r
     full join (select * from question_flags where user_id = $1 and category_id = $2) f on f.question_id = r.question_id`,
    [userId, categoryId]
  );
  return new Map(rows.map((row) => [row.question_id, { tries: row.tries, right: row.right, lastRight: row.last_right, flagged: row.flagged }]));
}

const findWeak = (questions: PoolQuestion[], history: Map<string, PracticeHistory>) => weakChapters(questions, history, WEAK_MIN_ANSWERED, WEAK_BELOW);

// --- Setup page

export async function loadPracticeOptions(userId: string): Promise<PracticeOptions | null> {
  const category = await currentCategory(pool, userId);
  if (!category) return null;
  const questions = await loadPool(pool, "practice", category.id);
  const perChapter = new Map<string, number>();
  const perType = new Map<QuestionType, number>();
  for (const q of questions) {
    perChapter.set(q.chapterId, (perChapter.get(q.chapterId) ?? 0) + 1);
    perType.set(q.type, (perType.get(q.type) ?? 0) + 1);
  }
  const history = await loadHistory(pool, userId, category.id);
  const weak = findWeak(questions, history);
  const weakSet = new Set(weak.map((item) => item.chapterId));
  const { rows } = await pool.query<{ id: string; title: string; number: number; section_position: number; section_title: string }>(
    `with ${NUMBERED} select id, title, number, section_position, section_title from numbered where id = any($1::uuid[]) order by number`,
    [[...perChapter.keys()]]
  );
  const labels = new Map(rows.map((row) => [row.id, chapterLabel(row)]));
  const sections: PracticeOptions["sections"] = [];
  for (const row of rows) {
    const label = `${sectionLetter(row.section_position)} · ${row.section_title}`;
    let section = sections[sections.length - 1];
    if (!section || section.label !== label) {
      section = { label, chapters: [] };
      sections.push(section);
    }
    section.chapters.push({ id: row.id, label: chapterLabel(row), count: perChapter.get(row.id) ?? 0 });
  }
  return {
    categoryName: category.name,
    total: questions.length,
    sections,
    types: availableQuestionTypes()
      .filter((type) => perType.has(type))
      .map((type) => ({ type, name: PRACTICE_TYPE_NAMES[type], count: perType.get(type) ?? 0 })),
    focus: {
      wrong: questions.filter((q) => isWrong(history, q.id)).length,
      flagged: questions.filter((q) => isFlagged(history, q.id)).length,
      unseen: questions.filter((q) => isUnseen(history, q.id)).length,
      weak: questions.filter((q) => weakSet.has(q.chapterId)).length,
    },
    weakChapters: weak.map((item) => ({ id: item.chapterId, label: labels.get(item.chapterId) ?? "", percent: Math.round(item.share * 100) })),
  };
}

export type OpenPractice = { id: string; position: number; total: number; answered: number };

// The run in progress, if it belongs to the current category; one from another category is closed.
export async function loadOpenPractice(userId: string): Promise<OpenPractice | null> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<SessionRow & { current_category_id: string }>(
      `select s.*, u.current_category_id from practice_sessions s join users u on u.id = s.user_id
       where s.user_id = $1 and s.finished_at is null for update of s`,
      [userId]
    );
    const open = rows[0];
    if (!open) return null;
    if (open.category_id !== open.current_category_id) {
      await closeOpen(client, open);
      return null;
    }
    return { id: open.id, position: open.position, total: open.total, answered: open.answered };
  });
}

// --- Starting

// The focused ways that simply narrow the pool.
const FOCUS = {
  wrong: { keep: isWrong, none: "There are no questions you got wrong in Practice. Well done." },
  flagged: { keep: isFlagged, none: "You haven’t flagged any questions yet." },
  unseen: { keep: isUnseen, none: "You’ve practised every question at least once." },
} as const;

export type StartRequest = { way: PracticeWay; choices: string[]; size: number | "all" };
export type StartReply = { ok: true; id: string } | { ok: false; error: string };

export async function startPractice(userId: string, request: StartRequest): Promise<StartReply> {
  if (request.size !== "all" && !PRACTICE_SIZES.some((size) => size === request.size)) return { ok: false, error: "Choose how many questions." };
  return withTransaction(async (client) => {
    await client.query(`select 1 from users where id = $1 for update`, [userId]);
    const category = await currentCategory(client, userId);
    if (!category) return { ok: false, error: "Your account isn’t available." };
    let questions = await loadPool(client, "practice", category.id);
    let choices: string[] = [];
    if (request.way === "chapters") {
      choices = [...new Set(request.choices)].filter((id) => questions.some((q) => q.chapterId === id));
      if (choices.length === 0) return { ok: false, error: "Choose at least one chapter." };
      questions = questions.filter((q) => choices.includes(q.chapterId));
    } else if (request.way === "types") {
      choices = [...new Set(request.choices)].filter((type) => questions.some((q) => q.type === type));
      if (choices.length === 0) return { ok: false, error: "Choose at least one type of question." };
      questions = questions.filter((q) => choices.includes(q.type));
    }
    const history = await loadHistory(client, userId, category.id);
    const weak = new Set(findWeak(questions, history).map((item) => item.chapterId));
    const focus = FOCUS[request.way as keyof typeof FOCUS];
    if (focus) {
      questions = questions.filter((q) => focus.keep(history, q.id));
      if (questions.length === 0) return { ok: false, error: focus.none };
    }
    if (request.way === "weak") {
      choices = [...weak];
      if (choices.length === 0) return { ok: false, error: "You don’t have any weak areas yet. Practise a little more to find them." };
    }
    if (questions.length === 0) return { ok: false, error: "There are no practice questions for this choice yet." };

    const count = Math.min(request.size === "all" ? questions.length : request.size, questions.length, MAX_QUESTIONS);
    let picked: PoolQuestion[];
    if (request.way === "smart") picked = smartPick(questions, history, count, random, weak);
    else if (request.way === "weak") picked = weakPick(questions, history, weak, Math.min(count, questions.filter((q) => weak.has(q.chapterId)).length), random);
    else picked = spreadOrder(spreadPick(questions, count, random), random);
    if (picked.length === 0) return { ok: false, error: "There are no practice questions for this choice yet." };
    return { ok: true, id: await createSession(client, userId, category.id, request.way, choices, picked) };
  });
}

// "Practise these again": the wrong answers of the candidate's latest finished run, if still in the pool.
export async function startRetry(userId: string, sessionId: string): Promise<StartReply> {
  return withTransaction(async (client) => {
    await client.query(`select 1 from users where id = $1 for update`, [userId]);
    const category = await currentCategory(client, userId);
    if (!category) return { ok: false, error: "Your account isn’t available." };
    const { rows } = await client.query<SessionRow>(
      `select * from practice_sessions where id = $1 and user_id = $2 and finished_at is not null and question_ids is not null`,
      [sessionId, userId]
    );
    const source = rows[0];
    if (!source || source.category_id !== category.id) return { ok: false, error: "These questions can’t be practised again from here." };
    const wrong = (source.question_ids ?? []).filter((_, index) => source.results?.[index] === "W");
    const questions = (await loadPool(client, "practice", category.id)).filter((q) => wrong.includes(q.id));
    if (questions.length === 0) return { ok: false, error: "These questions are no longer available for practice." };
    return { ok: true, id: await createSession(client, userId, category.id, "retry", [], shuffle(questions, random)) };
  });
}

async function createSession(client: Db, userId: string, categoryId: string, mode: PracticeMode, choices: string[], picked: PoolQuestion[]) {
  const { rows: open } = await client.query<SessionRow>(`select * from practice_sessions where user_id = $1 and finished_at is null for update`, [userId]);
  if (open[0]) await closeOpen(client, open[0]);
  const { rows } = await client.query<{ id: string }>(
    `insert into practice_sessions (user_id, category_id, mode, choices, question_ids, results, total)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [userId, categoryId, mode, choices, picked.map((q) => q.id), ".".repeat(picked.length), picked.length]
  );
  return rows[0].id;
}

// --- The run

type SessionRow = {
  id: string;
  user_id: string;
  category_id: string;
  mode: PracticeMode;
  choices: string[];
  question_ids: string[] | null;
  results: string | null;
  position: number;
  total: number;
  answered: number;
  right_count: number;
  chapter_summary: Record<string, [number, number]> | null;
  seconds_spent: number;
  started_at: Date;
  updated_at: Date;
  finished_at: Date | null;
};

const setChar = (text: string, index: number, char: string) => text.slice(0, index) + char + text.slice(index + 1);

export type PracticeView = { kind: "step"; step: PracticeStep } | { kind: "report" } | { kind: "closed" } | { kind: "missing" };

// What /dashboard/practice/[id] shows. Skips questions removed since the start; finishes at the end.
export async function loadPracticeView(userId: string, sessionId: string): Promise<PracticeView> {
  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query<SessionRow & { current_category_id: string }>(
      `select s.*, u.current_category_id from practice_sessions s join users u on u.id = s.user_id
       where s.id = $1 and s.user_id = $2 for update of s`,
      [sessionId, userId]
    );
    const session = rows[0];
    if (!session) return { kind: "missing" as const };
    if (session.finished_at) return { kind: "report" as const };
    if (session.category_id !== session.current_category_id) {
      await closeOpen(client, session);
      return { kind: "closed" as const };
    }
    return settle(client, session);
  });
  if (outcome.kind !== "settled") return outcome;
  return { kind: "step", step: await buildStep(outcome.session, outcome.question) };
}

type Settled =
  | { kind: "settled"; session: SessionRow; question: LoadedQuestion }
  | { kind: "report" }
  | { kind: "closed" };

// Moves past removed questions (marked S) to one that can be shown; finishes the run if none is left.
async function settle(client: Db, session: SessionRow): Promise<Settled> {
  const ids = session.question_ids ?? [];
  let results = session.results ?? "";
  let position = session.position;
  // Read a few questions ahead at a time; usually the first one is the one shown.
  const questions = new Map<string, LoadedQuestion>();
  let loadedTo = position;
  let current: (LoadedQuestion) | undefined;
  while (position < ids.length) {
    if (position >= loadedTo) {
      for (const [id, question] of await loadQuestions(client, ids.slice(position, position + LOOK_AHEAD), { use: "practice", categoryId: session.category_id })) questions.set(id, question);
      loadedTo = position + LOOK_AHEAD;
    }
    const mark = results[position];
    if (mark === "." && questions.has(ids[position])) {
      current = questions.get(ids[position]);
      break;
    }
    // An answered question stays on screen until Next, even if it left the pool meanwhile.
    if (mark === "R" || mark === "W") {
      current = questions.get(ids[position]) ?? (await loadAnyQuestion(client, ids[position]));
      if (current) break;
    }
    if (mark === ".") results = setChar(results, position, "S");
    position += 1;
  }
  if (results !== session.results || position !== session.position) {
    await client.query(`update practice_sessions set results = $2, position = $3 where id = $1`, [session.id, results, position]);
  }
  const updated = { ...session, results, position };
  if (!current) {
    if (updated.answered === 0) {
      await client.query(`delete from practice_sessions where id = $1`, [session.id]);
      return { kind: "closed" };
    }
    await finish(client, updated);
    return { kind: "report" };
  }
  return { kind: "settled", session: updated, question: current };
}

// Answered questions, whether or not still in the pool (shown once more with their answer, or on the report).
const loadAnyQuestion = async (db: Db, id: string) => (await loadQuestions(db, [id])).get(id);

async function buildStep(session: SessionRow, question: LoadedQuestion): Promise<PracticeStep> {
  const id = (session.question_ids ?? [])[session.position];
  const mark = session.results?.[session.position];
  const [media, flags] = await Promise.all([
    resolveMedia(question.mediaIds),
    pool.query(`select 1 from question_flags where user_id = $1 and category_id = $2 and question_id = $3`, [session.user_id, session.category_id, id]),
  ]);
  const client: ClientQuestion = toClientQuestion({ ...question, id }, "practice");
  return {
    sessionId: session.id,
    position: session.position,
    total: session.total,
    answered: session.answered,
    rightCount: session.right_count,
    chapterLabel: question.chapterLabel,
    question: client,
    media,
    checked: mark === "R" || mark === "W" ? { answered: true, correct: mark === "R", answer: question.answer, explanation: question.explanation } : null,
    flagged: (flags.rowCount ?? 0) > 0,
  };
}

async function lockOpen(client: Db, userId: string, sessionId: string) {
  const { rows } = await client.query<SessionRow & { current_category_id: string }>(
    `select s.*, u.current_category_id from practice_sessions s join users u on u.id = s.user_id
     where s.id = $1 and s.user_id = $2 and s.finished_at is null for update of s`,
    [sessionId, userId]
  );
  return rows[0] ?? null;
}

export async function checkPractice(userId: string, sessionId: string, position: number, response: unknown): Promise<PracticeCheckReply> {
  if (isOversizedResponse(response)) return { ok: false, reason: "invalid" };
  return withTransaction(async (client): Promise<PracticeCheckReply> => {
    const session = await lockOpen(client, userId, sessionId);
    if (!session || session.category_id !== session.current_category_id) return { ok: false, reason: "moved" };
    const ids = session.question_ids ?? [];
    if (position !== session.position || position >= ids.length) return { ok: false, reason: "invalid" };
    const questionId = ids[position];
    const mark = session.results?.[position];
    const question = (await loadQuestions(client, [questionId], { use: "practice", categoryId: session.category_id })).get(questionId);
    // Already marked (e.g. a second tap): the same result again, counted once.
    if (mark === "R" || mark === "W") {
      const shown = question ?? (await loadAnyQuestion(client, questionId));
      if (!shown) return { ok: false, reason: "gone" };
      return { ok: true, checked: { answered: true, correct: mark === "R", answer: shown.answer, explanation: shown.explanation } };
    }
    if (!question) {
      await client.query(`update practice_sessions set results = $2 where id = $1`, [session.id, setChar(session.results ?? "", position, "S")]);
      return { ok: false, reason: "gone" };
    }
    const result = checkAnswer(question, response);
    if (!result?.answered) return { ok: false, reason: "invalid" };

    await client.query(
      `update practice_sessions
       set results = $2, answered = answered + 1, right_count = right_count + $3::int,
           seconds_spent = seconds_spent + least(${MAX_GAP_SECONDS}, greatest(0, extract(epoch from now() - updated_at)))::int,
           updated_at = now()
       where id = $1`,
      [session.id, setChar(session.results ?? "", position, result.correct ? "R" : "W"), result.correct ? 1 : 0]
    );
    await recordQuestionResult(client, { userId, categoryId: session.category_id, questionId }, { source: "practice", correct: result.correct });
    return { ok: true, checked: { ...result, answer: question.answer, explanation: question.explanation } };
  });
}

export async function nextPractice(userId: string, sessionId: string, position: number): Promise<PracticeNextReply> {
  const outcome = await withTransaction(async (client) => {
    const session = await lockOpen(client, userId, sessionId);
    if (!session || session.category_id !== session.current_category_id) return { kind: "moved" as const };
    // Only from an answered (or skipped) question; otherwise the current one is sent again.
    if (position === session.position && session.results?.[position] !== ".") {
      await client.query(
        `update practice_sessions
         set position = position + 1,
             seconds_spent = seconds_spent + least(${MAX_GAP_SECONDS}, greatest(0, extract(epoch from now() - updated_at)))::int,
             updated_at = now()
         where id = $1`,
        [session.id]
      );
      session.position += 1;
    }
    return settle(client, session);
  });
  if (outcome.kind === "moved" || outcome.kind === "closed") return { ok: false, reason: "moved" };
  if (outcome.kind === "report") return { ok: true, finished: true };
  return { ok: true, step: await buildStep(outcome.session, outcome.question) };
}

// End practice: with answers it becomes a finished run; with none it's simply removed.
export async function endPractice(userId: string, sessionId: string): Promise<"finished" | "removed" | "missing"> {
  return withTransaction(async (client) => {
    const session = await lockOpen(client, userId, sessionId);
    if (!session) return "missing";
    if (session.answered === 0) {
      await client.query(`delete from practice_sessions where id = $1`, [session.id]);
      return "removed";
    }
    await finish(client, session);
    return "finished";
  });
}

async function closeOpen(client: Db, session: SessionRow) {
  if (session.answered === 0) await client.query(`delete from practice_sessions where id = $1`, [session.id]);
  else await finish(client, session);
}

// Totals per chapter are kept; only the latest finished run keeps its question list.
async function finish(client: Db, session: SessionRow) {
  const ids = session.question_ids ?? [];
  const { rows } = await client.query<{ id: string; chapter_id: string }>(`select id, chapter_id from questions where id = any($1::uuid[])`, [ids]);
  const chapterOf = new Map(rows.map((row) => [row.id, row.chapter_id]));
  const summary: Record<string, [number, number]> = {};
  ids.forEach((id, index) => {
    const mark = session.results?.[index];
    const chapter = chapterOf.get(id);
    if (!chapter || (mark !== "R" && mark !== "W")) return;
    const entry = (summary[chapter] ??= [0, 0]);
    if (mark === "R") entry[0] += 1;
    entry[1] += 1;
  });
  await client.query(`update practice_sessions set finished_at = now(), chapter_summary = $2 where id = $1`, [session.id, JSON.stringify(summary)]);
  await client.query(
    `update practice_sessions set question_ids = null, results = null
     where user_id = $1 and finished_at is not null and id <> $2 and question_ids is not null`,
    [session.user_id, session.id]
  );
  await client.query(
    `delete from practice_sessions where user_id = $1 and finished_at is not null and id not in (
       select id from practice_sessions where user_id = $1 and finished_at is not null order by finished_at desc, id limit ${KEEP_FINISHED}
     )`,
    [session.user_id]
  );
}

// --- Report

export type PracticeReport = {
  id: string;
  categoryName: string;
  mode: PracticeMode;
  choiceNames: string[];
  total: number;
  answered: number;
  rightCount: number;
  skipped: number;
  secondsSpent: number;
  finishedAt: string;
  chapters: { label: string; right: number; answered: number }[];
  // Only for the latest run (older ones keep totals only).
  wrong: { question: ClientQuestion; checked: PracticeChecked; chapterLabel: string; flagged: boolean }[] | null;
  media: ResolvedMedia;
  canRetry: boolean;
};

export async function loadPracticeReport(userId: string, sessionId: string): Promise<PracticeReport | null> {
  const { rows } = await pool.query<SessionRow & { category_name: string; current_category_id: string }>(
    `select s.*, c.name as category_name, u.current_category_id
     from practice_sessions s join categories c on c.id = s.category_id join users u on u.id = s.user_id
     where s.id = $1 and s.user_id = $2 and s.finished_at is not null`,
    [sessionId, userId]
  );
  const session = rows[0];
  if (!session) return null;

  const summary = session.chapter_summary ?? {};
  const { rows: chapterRows } = await pool.query<{ id: string; title: string; number: number }>(
    `with ${NUMBERED} select id, title, number from numbered where id = any($1::uuid[]) order by number`,
    [Object.keys(summary)]
  );
  const chapters = chapterRows.map((row) => ({ label: chapterLabel(row), right: summary[row.id][0], answered: summary[row.id][1] }));

  let choiceNames: string[] = [];
  if (session.mode === "types") choiceNames = session.choices.filter(isQuestionType).map((type) => PRACTICE_TYPE_NAMES[type]);
  if (session.mode === "chapters" || session.mode === "weak") {
    const { rows: chosen } = await pool.query<{ title: string; number: number }>(
      `with ${NUMBERED} select title, number from numbered where id::text = any($1::text[]) order by number`,
      [session.choices]
    );
    choiceNames = chosen.map(chapterLabel);
  }

  let wrong: PracticeReport["wrong"] = null;
  let media: ResolvedMedia = {};
  if (session.question_ids && session.results) {
    const wrongIds = session.question_ids.filter((_, index) => session.results?.[index] === "W");
    const questions = await loadQuestions(pool, wrongIds);
    const list = wrongIds.flatMap((id) => {
      const question = questions.get(id);
      return question ? [{ id, question }] : [];
    });
    media = await resolveMedia(list.flatMap((item) => item.question.mediaIds));
    const { rows: flagRows } = await pool.query<{ question_id: string }>(
      `select question_id from question_flags where user_id = $1 and category_id = $2 and question_id = any($3::uuid[])`,
      [userId, session.category_id, wrongIds]
    );
    const flagged = new Set(flagRows.map((row) => row.question_id));
    wrong = list.map(({ id, question }) => ({
      flagged: flagged.has(id),
      question: toClientQuestion({ ...question, id }, "practice"),
      checked: { answered: true, correct: false, answer: question.answer, explanation: question.explanation },
      chapterLabel: question.chapterLabel,
    }));
  }

  return {
    id: session.id,
    categoryName: session.category_name,
    mode: session.mode,
    choiceNames,
    total: session.total,
    answered: session.answered,
    rightCount: session.right_count,
    skipped: (session.results ?? "").split("").filter((mark) => mark === "S").length,
    secondsSpent: session.seconds_spent,
    finishedAt: (session.finished_at ?? session.updated_at).toISOString(),
    chapters,
    wrong,
    media,
    canRetry: Boolean(wrong && wrong.length > 0 && session.category_id === session.current_category_id),
  };
}

// Home card: the run in progress in the current category, read only.
export async function loadPracticeInProgress(userId: string): Promise<{ position: number; total: number } | null> {
  const { rows } = await pool.query<{ position: number; total: number }>(
    `select s.position, s.total from practice_sessions s join users u on u.id = s.user_id
     where s.user_id = $1 and s.finished_at is null and s.category_id = u.current_category_id`,
    [userId]
  );
  return rows[0] ?? null;
}

// Flag for review, on or off, for a question in the current category's practice pool.
export async function setFlag(userId: string, questionId: string, flagged: boolean): Promise<boolean | null> {
  const category = await currentCategory(pool, userId);
  if (!category) return null;
  if (!flagged) {
    await pool.query(`delete from question_flags where user_id = $1 and category_id = $2 and question_id = $3`, [userId, category.id, questionId]);
    return false;
  }
  const { rowCount } = await pool.query(
    `insert into question_flags (user_id, category_id, question_id)
     select $1, $2, q.id from questions q where q.id = $3 and ${inPool("practice", "$2")}
     on conflict do nothing`,
    [userId, category.id, questionId]
  );
  if (rowCount) return true;
  const { rows } = await pool.query(`select 1 from question_flags where user_id = $1 and category_id = $2 and question_id = $3`, [userId, category.id, questionId]);
  return rows.length > 0 ? true : null;
}
