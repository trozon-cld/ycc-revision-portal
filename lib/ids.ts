const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// For any input (form fields, URL parts, JSON): true only for a well-formed id.
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
