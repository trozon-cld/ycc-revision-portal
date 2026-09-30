// "2 Handbook pages, 1 question and 1 cover"; empty when the picture isn't used anywhere.
export function describeMediaUse(pages: number, questions: number, covers = 0): string {
  const parts: string[] = [];
  if (pages > 0) parts.push(`${pages} Handbook page${pages === 1 ? "" : "s"}`);
  if (questions > 0) parts.push(`${questions} question${questions === 1 ? "" : "s"}`);
  if (covers > 0) parts.push(`${covers} Handbook cover${covers === 1 ? "" : "s"}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
}
