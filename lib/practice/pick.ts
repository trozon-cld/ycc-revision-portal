import type { QuestionType } from "@/lib/questions/types";

// Choosing and ordering practice questions. Pure functions (randomness passed in), so they can be tested.

export type PoolQuestion = { id: string; chapterId: string; type: QuestionType };
// This category's Practice history for one question (Handbook answers don't count), and its flag.
export type PracticeHistory = { tries: number; right: number; lastRight: boolean | null; flagged: boolean };
export type Random = () => number;

export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Takes `count` questions, a chapter at a time in turn, so every chapter gets its share.
export function spreadPick(items: readonly PoolQuestion[], count: number, random: Random): PoolQuestion[] {
  const byChapter = new Map<string, PoolQuestion[]>();
  for (const item of shuffle(items, random)) {
    const list = byChapter.get(item.chapterId) ?? [];
    list.push(item);
    byChapter.set(item.chapterId, list);
  }
  const queues = shuffle([...byChapter.values()], random);
  const picked: PoolQuestion[] = [];
  while (picked.length < count && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && picked.length < count) picked.push(next);
    }
  }
  return picked;
}

// A random order in which neighbours share neither chapter nor question type where that can be avoided.
export function spreadOrder(items: readonly PoolQuestion[], random: Random): PoolQuestion[] {
  const left = shuffle(items, random);
  const ordered: PoolQuestion[] = [];
  while (left.length > 0) {
    const previous = ordered[ordered.length - 1];
    let index = previous ? left.findIndex((item) => item.chapterId !== previous.chapterId && item.type !== previous.type) : 0;
    if (index < 0) index = left.findIndex((item) => item.chapterId !== previous.chapterId);
    if (index < 0) index = 0;
    ordered.push(left.splice(index, 1)[0]);
  }
  return ordered;
}

const tried = (history: ReadonlyMap<string, PracticeHistory>, id: string) => (history.get(id)?.tries ?? 0) > 0;
export const isUnseen = (history: ReadonlyMap<string, PracticeHistory>, id: string) => !tried(history, id);
export const isWrong = (history: ReadonlyMap<string, PracticeHistory>, id: string) => tried(history, id) && history.get(id)?.lastRight === false;
export const isFlagged = (history: ReadonlyMap<string, PracticeHistory>, id: string) => history.get(id)?.flagged === true;

// Chapters answered enough in Practice and below the line, weakest first.
export function weakChapters(
  pool: readonly PoolQuestion[],
  history: ReadonlyMap<string, PracticeHistory>,
  minAnswered: number,
  below: number
): { chapterId: string; share: number }[] {
  const totals = new Map<string, { answered: number; tries: number; right: number }>();
  for (const item of pool) {
    const h = history.get(item.id);
    if (!h || h.tries === 0) continue;
    const t = totals.get(item.chapterId) ?? { answered: 0, tries: 0, right: 0 };
    t.answered += 1;
    t.tries += h.tries;
    t.right += h.right;
    totals.set(item.chapterId, t);
  }
  return [...totals]
    .filter(([, t]) => t.answered >= minAnswered && t.right / t.tries < below)
    .map(([chapterId, t]) => ({ chapterId, share: t.right / t.tries }))
    .sort((a, b) => a.share - b.share);
}

// Fills `count` from each group in turn (each spread across chapters), then mixes the order.
function pickInTiers(tiers: PoolQuestion[][], count: number, random: Random): PoolQuestion[] {
  const picked: PoolQuestion[] = [];
  const used = new Set<string>();
  for (const tier of tiers) {
    if (picked.length >= count) break;
    const fresh = tier.filter((item) => !used.has(item.id));
    for (const item of spreadPick(fresh, count - picked.length, random)) {
      picked.push(item);
      used.add(item.id);
    }
  }
  return spreadOrder(picked, random);
}

// Smart practice: not practised yet in this category, then wrong last time, then flagged, then weak
// chapters, then the rest.
export function smartPick(
  pool: readonly PoolQuestion[],
  history: ReadonlyMap<string, PracticeHistory>,
  count: number,
  random: Random,
  weak: ReadonlySet<string> = new Set()
): PoolQuestion[] {
  return pickInTiers(
    [
      pool.filter((item) => isUnseen(history, item.id)),
      pool.filter((item) => isWrong(history, item.id)),
      pool.filter((item) => isFlagged(history, item.id)),
      pool.filter((item) => weak.has(item.chapterId)),
      [...pool],
    ],
    count,
    random
  );
}

// Weak areas: questions from the weak chapters, wrong ones first, then unseen, then flagged.
export function weakPick(
  pool: readonly PoolQuestion[],
  history: ReadonlyMap<string, PracticeHistory>,
  weak: ReadonlySet<string>,
  count: number,
  random: Random
): PoolQuestion[] {
  const inWeak = pool.filter((item) => weak.has(item.chapterId));
  return pickInTiers(
    [
      inWeak.filter((item) => isWrong(history, item.id)),
      inWeak.filter((item) => isUnseen(history, item.id)),
      inWeak.filter((item) => isFlagged(history, item.id)),
      inWeak,
    ],
    count,
    random
  );
}
