/**
 * Demo persona allowlist (pure, importable anywhere). Emails are DERIVED from a
 * fixed key + slot, never taken from request input.
 */
/** Legacy presenter slot (P3). Not part of the public pool; left untouched. */
export const PRESENTER_SLOT = 0;
/** Public sandboxes are slots 1..DEMO_SLOTS (max 20). */
export const MAX_POOL_SLOTS = 20;

/** Featured personas shown in the persona switcher (any seeded persona can be switched to). */
export const SWITCHABLE_PERSONAS = [
  { key: "jordan", name: "Jordan Lee", blurb: "You. Full-stack builder looking for a team." },
  { key: "maya", name: "Maya Chen", blurb: "Design + frontend. Accept invitations as Maya." },
  { key: "priya", name: "Priya Raman", blurb: "ML engineer. Accept or decline as Priya." },
  { key: "alex", name: "Alex Morgan", blurb: "PM & pitch. Leads another team." },
] as const;

export type SwitchableKey = (typeof SWITCHABLE_PERSONAS)[number]["key"];
const SWITCHABLE = new Set<string>(SWITCHABLE_PERSONAS.map((p) => p.key));

export function isSwitchablePersona(key: unknown): key is SwitchableKey {
  return typeof key === "string" && SWITCHABLE.has(key);
}

const KEY_RE = /^[a-z][a-z0-9_]{1,31}$/;

/** Reserved TLD: these addresses can never receive mail or be self-registered. */
export function personaEmail(key: string, slot: number): string {
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

const PERSONA_EMAIL_RE = /^([a-z][a-z0-9_]{1,31})\.s(\d{1,2})@demo\.trojanmatch\.invalid$/;

/** Inverse of personaEmail: {key, slot} for a synthetic demo address, else null. */
export function parsePersonaEmail(email: string | null | undefined): { key: string; slot: number } | null {
  const m = PERSONA_EMAIL_RE.exec((email ?? "").toLowerCase());
  if (!m) return null;
  const slot = Number(m[2]);
  return slot >= 0 && slot <= MAX_POOL_SLOTS ? { key: m[1], slot } : null;
}

/** Slot number of a demo scope string ('demo:3' -> 3), else null. */
export function scopeSlot(scope: string | null | undefined): number | null {
  const m = /^demo:(\d{1,2})$/.exec(scope ?? "");
  return m ? Number(m[1]) : null;
}
