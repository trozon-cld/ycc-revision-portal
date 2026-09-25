// "2 pages and 1 question"; empty when the picture isn't used anywhere.
export function describeMediaUse(pages: number, questions: number): string {
  const parts: string[] = [];
  if (pages > 0) parts.push(`${pages} Handbook page${pages === 1 ? "" : "s"}`);
  if (questions > 0) parts.push(`${questions} question${questions === 1 ? "" : "s"}`);
  return parts.join(" and ");
}
