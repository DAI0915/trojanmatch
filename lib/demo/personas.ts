/**
 * Demo persona allowlist (pure, importable anywhere). Emails are DERIVED from a
 * fixed key + slot, never taken from request input.
 */
export const PRESENTER_SLOT = 0;

export const SWITCHABLE_PERSONAS = [
  { key: "jordan", name: "Jordan", blurb: "Presenter. Full-stack builder looking for a team." },
  { key: "maya", name: "Maya", blurb: "Frontend & design. Accepts invitations in the demo." },
  { key: "priya", name: "Priya", blurb: "ML engineer. Useful for Replace / decline scenarios." },
  { key: "alex", name: "Alex", blurb: "PM & pitch. Shows a second team perspective." },
] as const;

export type SwitchableKey = (typeof SWITCHABLE_PERSONAS)[number]["key"];
const SWITCHABLE = new Set<string>(SWITCHABLE_PERSONAS.map((p) => p.key));

export function isSwitchablePersona(key: unknown): key is SwitchableKey {
  return typeof key === "string" && SWITCHABLE.has(key);
}

const KEY_RE = /^[a-z][a-z0-9_]{1,31}$/;

/** Reserved TLD: these addresses can never receive mail or be self-registered. */
export function personaEmail(key: string, slot: number = PRESENTER_SLOT): string {
  if (!KEY_RE.test(key)) throw new Error("invalid persona key");
  if (!Number.isInteger(slot) || slot < 0 || slot > 20) throw new Error("invalid slot");
  return `${key}.s${slot}@demo.trojanmatch.invalid`;
}

export const LEASE_COOKIE = "tm_demo_lease";

/** Cookie value: "<slot>.<token>" — token is 32 random bytes, base64url. */
export function parseLeaseCookie(raw: string | undefined | null): { slot: number; token: string } | null {
  if (!raw) return null;
  const m = /^(\d{1,2})\.([A-Za-z0-9_-]{43})$/.exec(raw);
  if (!m) return null;
  const slot = Number(m[1]);
  if (slot < 0 || slot > 20) return null;
  return { slot, token: m[2] };
}

export function formatLeaseCookie(slot: number, token: string) {
  return `${slot}.${token}`;
}
