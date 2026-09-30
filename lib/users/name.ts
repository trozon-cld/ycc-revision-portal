export const NAME_MAX_LENGTH = 100;

export function normaliseName(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function validateName(name: string): string | null {
  if (!name) return "Enter a name.";
  if (name.length > NAME_MAX_LENGTH) return `Name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  return null;
}

// How a missing name reads in the activity log's "from → to".
export const NO_NAME = "No name";
