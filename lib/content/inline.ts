// The only inline formatting is **bold**. An unmatched ** is shown as typed.

export type InlineSegment = { text: string; bold: boolean };

export function parseInline(text: string): InlineSegment[] {
  const parts = text.split("**");
  // An even number of parts means one ** has no partner; glue the last one back as plain text.
  if (parts.length % 2 === 0) {
    const tail = parts.splice(parts.length - 2, 2).join("**");
    parts.push(tail);
  }
  const segments: InlineSegment[] = [];
  parts.forEach((part, index) => {
    if (!part) return;
    const bold = index % 2 === 1;
    const last = segments.at(-1);
    if (last && last.bold === bold) last.text += part;
    else segments.push({ text: part, bold });
  });
  return segments;
}

export function plainText(text: string): string {
  return parseInline(text)
    .map((segment) => segment.text)
    .join("");
}
