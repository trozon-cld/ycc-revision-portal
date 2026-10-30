// A table or column name in SQL. Only for names from the code or the database itself, never from a request.
export const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;
