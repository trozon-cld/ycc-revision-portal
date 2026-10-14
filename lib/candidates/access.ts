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

// The UK day of a moment, as YYYY-MM-DD.
function ukDay(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ACCESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function todayInUk(): string {
  return ukDay(new Date());
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

// Presets count from `base` (today, or a later current end date when access is extended).
export function resolveAccessEndDate(
  formData: FormData,
  base: string = todayInUk()
): { date: string } | { error: string } {
  const length = String(formData.get("accessLength") ?? "");
  const { min, max } = customDateBounds();

  const presetDays = ACCESS_PRESET_DAYS.find((days) => String(days) === length);
  if (presetDays) {
    const date = addDays(base, presetDays);
    if (date > max) {
      return { error: `That would end access on ${formatUkDate(dateOnly(date))}, more than 1 year from today. Choose a shorter length or a date.` };
    }
    return { date };
  }

  if (length !== "custom") {
    return { error: "Choose how long access should last." };
  }

  const date = String(formData.get("accessDate") ?? "");
  if (!DATE_PATTERN.test(date) || addDays(date, 0) !== date) {
    return { error: "Choose a valid end date." };
  }
  if (date < min) {
    return { error: "The end date must be after today." };
  }
  if (date > max) {
    return { error: "The end date can be at most 1 year from today." };
  }
  return { date };
}

// The UK day access ends on (YYYY-MM-DD), or today if that has passed or there is none: presets add to it.
export function accessBaseDate(expiresAt: string | Date | null): string {
  const today = todayInUk();
  if (!expiresAt) return today;
  const end = ukDay(expiresAt);
  return end > today ? end : today;
}

// A YYYY-MM-DD day as a Date at midday UTC, so formatting in UK time shows that same day.
export function dateOnly(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

// "5 Oct 2026" (short, admin pages) or "5 October 2026" (long, candidate pages).
export function formatUkDate(value: string | Date, month: "short" | "long" = "short"): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month,
    year: "numeric",
    timeZone: ACCESS_TIME_ZONE,
  });
}

// "8 Oct 2026, 15:34", UK time: dates with a time on admin pages.
export function formatUkDateTime(value: string | Date): string {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ACCESS_TIME_ZONE,
  });
}

// "14:05", UK time.
export function formatUkTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ACCESS_TIME_ZONE });
}

// Whether access has already ended (no end date: never).
export function accessEnded(expiresAt: string | Date | null): boolean {
  return expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
}

// Whole days left before access ends, counted in UK days (0 on the last day).
export function daysLeftUk(expiresAt: string | Date): number {
  const diff = Date.parse(`${ukDay(expiresAt)}T00:00:00Z`) - Date.parse(`${todayInUk()}T00:00:00Z`);
  return Math.round(diff / 86_400_000);
}
