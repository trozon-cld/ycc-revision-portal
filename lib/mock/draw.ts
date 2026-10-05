import { spreadOrder, type Random } from "@/lib/practice/pick";
import type { PoolQuestion } from "@/lib/questions/pool";
import { shuffle } from "@/lib/questions/shuffle";

// Choosing a mock test's questions. Pure functions (randomness passed in), so they can be tested.

// Each chapter's share of `count`, in proportion to its size (largest remainder; ties drawn at random).
export function chapterShares(sizes: ReadonlyMap<string, number>, count: number, random: Random): Map<string, number> {
  const total = [...sizes.values()].reduce((sum, size) => sum + size, 0);
  const want = Math.min(count, total);
  const shares = new Map<string, number>();
  const rest: { id: string; remainder: number; tie: number }[] = [];
  for (const [id, size] of sizes) {
    const exact = total === 0 ? 0 : (want * size) / total;
    shares.set(id, Math.floor(exact));
    rest.push({ id, remainder: exact - Math.floor(exact), tie: random() });
  }
  let left = want - [...shares.values()].reduce((sum, share) => sum + share, 0);
  rest.sort((a, b) => b.remainder - a.remainder || a.tie - b.tie);
  for (const item of rest) {
    if (left === 0) break;
    if ((shares.get(item.id) ?? 0) < (sizes.get(item.id) ?? 0)) {
      shares.set(item.id, (shares.get(item.id) ?? 0) + 1);
      left -= 1;
    }
  }
  return shares;
}

// `count` questions spread across chapters by size, avoiding `avoid` (the last test's questions) where a
// chapter has enough others, in an order that mixes chapters and question types.
export function drawMock(pool: readonly PoolQuestion[], count: number, avoid: ReadonlySet<string>, random: Random): PoolQuestion[] {
  const byChapter = new Map<string, PoolQuestion[]>();
  for (const item of pool) byChapter.set(item.chapterId, [...(byChapter.get(item.chapterId) ?? []), item]);
  const shares = chapterShares(new Map([...byChapter].map(([id, list]) => [id, list.length])), count, random);
  const picked: PoolQuestion[] = [];
  for (const [id, list] of byChapter) {
    const fresh = shuffle(list.filter((item) => !avoid.has(item.id)), random);
    const seen = shuffle(list.filter((item) => avoid.has(item.id)), random);
    picked.push(...[...fresh, ...seen].slice(0, shares.get(id) ?? 0));
  }
  return spreadOrder(picked, random);
}
