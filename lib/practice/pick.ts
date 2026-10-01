import type { QuestionType } from "@/lib/questions/types";

// Choosing and ordering practice questions. Pure functions (randomness passed in), so they can be tested.

export type PoolQuestion = { id: string; chapterId: string; type: QuestionType };
// This category's Practice history for one question.
export type PracticeHistory = { tries: number; lastRight: boolean | null };
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

// Smart practice: not practised yet in this category first, then wrong last time, then the rest.
export function smartPick(
  pool: readonly PoolQuestion[],
  history: ReadonlyMap<string, PracticeHistory>,
  count: number,
  random: Random
): PoolQuestion[] {
  const unseen = pool.filter((item) => !history.get(item.id)?.tries);
  const wrong = pool.filter((item) => history.get(item.id)?.tries && history.get(item.id)?.lastRight === false);
  const rest = pool.filter((item) => history.get(item.id)?.tries && history.get(item.id)?.lastRight !== false);
  const picked: PoolQuestion[] = [];
  for (const tier of [unseen, wrong, rest]) {
    if (picked.length >= count) break;
    picked.push(...spreadPick(tier, count - picked.length, random));
  }
  return spreadOrder(picked, random);
}
