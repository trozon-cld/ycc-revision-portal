// Candidate access ends at the end of the chosen day, UK time (CITB is a UK test).

export const ACCESS_TIME_ZONE = "Europe/London";
export const ACCESS_PRESET_DAYS = [30, 60, 90] as const;
export const DEFAULT_ACCESS_DAYS = 30;
export const MAX_ACCESS_DAYS = 365;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Turns a YYYY-MM-DD parameter into the last millisecond of that day in UK time.
export function accessEndSql(param: string) {
  return `(((${param}::date + 1)::timestamp at time zone '${ACCESS_TIME_ZONE}') - interval '1 millisecond')`;
}

export function todayInUk(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ACCESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function customDateBounds() {
  const today = todayInUk();
  return { min: addDays(today, 1), max: addDays(today, MAX_ACCESS_DAYS) };
}

export function resolveAccessEndDate(
  formData: FormData
): { date: string } | { error: string } {
  const length = String(formData.get("accessLength") ?? "");
  const today = todayInUk();

  const presetDays = ACCESS_PRESET_DAYS.find((days) => String(days) === length);
  if (presetDays) {
    return { date: addDays(today, presetDays) };
  }

  if (length !== "custom") {
    return { error: "Choose how long access should last." };
  }

  const date = String(formData.get("accessDate") ?? "");
  if (!DATE_PATTERN.test(date) || addDays(date, 0) !== date) {
    return { error: "Choose a valid end date." };
  }
  const { min, max } = customDateBounds();
  if (date < min) {
    return { error: "The end date must be after today." };
  }
  if (date > max) {
    return { error: "The end date can be at most 1 year from today." };
  }
  return { date };
}

export function formatUkDate(value: string | Date): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: ACCESS_TIME_ZONE,
  });
}
