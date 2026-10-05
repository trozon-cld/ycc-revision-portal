// A page's search parameter may arrive repeated (?a=1&a=2); the first value is the one used.
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
