export function formatDateRange(startIso: string | null, endIso: string | null, timeZone?: string | null) {
  if (!startIso) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: timeZone ?? undefined };
  const s = new Date(startIso);
  const e = endIso ? new Date(endIso) : null;
  const fmt = new Intl.DateTimeFormat("en-US", opts);
  const yearFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: timeZone ?? undefined });
  if (!e) return `${fmt.format(s)}, ${yearFmt.format(s)}`;
  const same = fmt.format(s) === fmt.format(e);
  return same ? `${fmt.format(s)}, ${yearFmt.format(e)}` : `${fmt.format(s)} – ${fmt.format(e)}, ${yearFmt.format(e)}`;
}

export function formatDateTime(iso: string, timeZone?: string | null) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone ?? undefined,
    timeZoneName: "short",
  }).format(new Date(iso));
}

export const FORMAT_LABEL: Record<string, string> = { in_person: "In person", online: "Online", hybrid: "Hybrid" };

export function teamSizeLabel(min: number, max: number) {
  return min === max ? `${min} per team` : `${min}–${max} per team`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "in 47 h", "in 25 min", "expired" — coarse, for invitation expiry. */
export function expiresIn(iso: string, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "expired";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `in ${h} h` : `in ${Math.round(h / 24)} days`;
}

export function timeAgo(iso: string, now = Date.now()) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
