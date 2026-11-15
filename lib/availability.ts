/**
 * Availability is stored as UTC hour-of-week indices (0 = Sunday 00:00 UTC …
 * 167 = Saturday 23:00 UTC) so overlap can be computed across time zones.
 * The UI edits it in the user's own time zone in 4-hour blocks.
 */

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const BLOCK_HOURS = 4;
export const BLOCKS = [
  { start: 0, label: "12a–4a" },
  { start: 4, label: "4a–8a" },
  { start: 8, label: "8a–12p" },
  { start: 12, label: "12p–4p" },
  { start: 16, label: "4p–8p" },
  { start: 20, label: "8p–12a" },
] as const;

const HOURS_PER_WEEK = 168;
const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * UTC offset of a time zone in whole hours at a reference instant (DST-aware
 * for that instant). Half-hour zones are rounded toward zero.
 */
export function tzOffsetHours(timeZone: string, at: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const diffMinutes = Math.round((asUtc - at.getTime()) / 60000);
  return Math.trunc(diffMinutes / 60);
}

export function localToUtcHours(localHours: Iterable<number>, timeZone: string, at?: Date): number[] {
  const off = tzOffsetHours(timeZone, at);
  return [...new Set([...localHours].map((h) => mod(h - off, HOURS_PER_WEEK)))].sort((a, b) => a - b);
}

export function utcToLocalHours(utcHours: Iterable<number>, timeZone: string, at?: Date): number[] {
  const off = tzOffsetHours(timeZone, at);
  return [...new Set([...utcHours].map((h) => mod(h + off, HOURS_PER_WEEK)))].sort((a, b) => a - b);
}

/** Local hours covered by a (day, block) cell. */
export function blockHours(day: number, blockStart: number): number[] {
  return Array.from({ length: BLOCK_HOURS }, (_, i) => day * 24 + blockStart + i);
}

export function isValidHourList(hours: unknown): hours is number[] {
  return (
    Array.isArray(hours) &&
    hours.length <= HOURS_PER_WEEK &&
    hours.every((h) => Number.isInteger(h) && h >= 0 && h < HOURS_PER_WEEK)
  );
}
