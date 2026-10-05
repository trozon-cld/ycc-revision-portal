// Makes the user's % and _ literal in a LIKE/ILIKE search (Postgres escapes with backslash).
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
