import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { errorResponse } from "@/lib/api/handler";
import { isAllowedOrigin } from "@/lib/api/origin";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { demoAdminClient } from "./admin";
import { demoConfig } from "./config";
import { personaPassword, sha256Hex } from "./crypto";
import { DEMO_PERSONAS, demoFixture } from "./fixtures";
import { LEASE_COOKIE, formatLeaseCookie, parseLeaseCookie, personaEmail } from "./personas";

type Cfg = NonNullable<ReturnType<typeof demoConfig>>;
type Admin = ReturnType<typeof demoAdminClient>;
export type DemoContext = { req: NextRequest; cfg: Cfg; admin: Admin };
export type Lease = { slot: number; token: string; hash: string; leasedUntil: string };

const PERSONA_KEYS = new Set(DEMO_PERSONAS.map((p) => p.key));
export function isDemoPersonaKey(key: unknown): key is string {
  return typeof key === "string" && PERSONA_KEYS.has(key);
}

/** Demo route wrapper: 404 unless Demo Mode is fully configured; Origin-checked. */
export function withDemo(handler: (ctx: DemoContext) => Promise<Response>) {
  return async (req: NextRequest) => {
    try {
      const cfg = demoConfig();
      if (!cfg) throw new ApiError("DEMO_DISABLED", "Demo Mode is not available.");
      if (!isAllowedOrigin(req.method, req.headers, publicEnv.NEXT_PUBLIC_APP_URL)) {
        throw new ApiError("FORBIDDEN_ORIGIN", "Cross-origin request rejected.");
      }
      return await handler({ req, cfg, admin: demoAdminClient(cfg.SUPABASE_SERVICE_ROLE_KEY) });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** The lease this browser holds, if it is the CURRENT active lease of a pool slot. */
export async function currentLease(cfg: Cfg, admin: Admin): Promise<Lease | null> {
  const lease = parseLeaseCookie((await cookies()).get(LEASE_COOKIE)?.value);
  if (!lease || lease.slot < 1 || lease.slot > cfg.DEMO_SLOTS) return null;
  const hash = sha256Hex(lease.token);
  const { data, error } = await admin.rpc("demo_check_lease", { p_slot: lease.slot, p_token_hash: hash });
  const d = (data ?? {}) as { valid?: boolean; leased_until?: string };
  if (error || !d.valid) return null;
  return { ...lease, hash, leasedUntil: d.leased_until ?? "" };
}

/** Throws DEMO_LEASE_INVALID unless the request carries an active sandbox lease. */
export async function requireLease(cfg: Cfg, admin: Admin): Promise<Lease> {
  const lease = await currentLease(cfg, admin);
  if (!lease) throw new ApiError("DEMO_LEASE_INVALID", "Your demo session has ended. Start a new one.");
  return lease;
}

export async function setLeaseCookie(slot: number, token: string, minutes: number) {
  const store = await cookies();
  store.set(LEASE_COOKIE, formatLeaseCookie(slot, token), {
    httpOnly: true,
    secure: publicEnv.NEXT_PUBLIC_APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: minutes * 60,
  });
}

export async function clearLeaseCookie() {
  const store = await cookies();
  store.delete(LEASE_COOKIE);
}

/**
 * Signs the browser in as a seeded persona OF THIS SLOT using supported Auth
 * APIs. The email is derived from (key, slot); the password is derived
 * server-side and never leaves the server.
 *
 * We deliberately do NOT revoke the previous session first: in-flight requests
 * (e.g. Next.js prefetches) still carrying the old cookies would then fail auth
 * and their responses would clear the NEW session cookies. signInWithPassword
 * replaces this browser's cookies; every demo request is still gated by the lease.
 */
export async function signInAsPersona(cfg: Cfg, slot: number, key: string) {
  if (!isDemoPersonaKey(key)) throw new ApiError("INVALID_INPUT", "Unknown persona.");
  const supabase = await createClient();
  const email = personaEmail(key, slot);
  const { error } = await supabase.auth.signInWithPassword({ email, password: personaPassword(cfg.DEMO_PERSONA_SECRET, email) });
  if (error) {
    console.error("[demo] persona sign-in failed", slot, key, error.code);
    throw new ApiError("INTERNAL", "This demo sandbox isn't ready. Please try again in a moment.");
  }
}

/**
 * Salted hash of the client IP for throttling (raw IPs are never stored).
 * On Vercel, x-real-ip / x-forwarded-for are set by the platform edge (client-supplied values are
 * not trusted); x-real-ip is preferred.
 */
export async function clientSubject(cfg: Cfg) {
  const h = await headers();
  const ip = h.get("x-real-ip")?.trim() || (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  return `demo:${sha256Hex(`${cfg.DEMO_PERSONA_SECRET}|${ip}`).slice(0, 32)}`;
}

/**
 * Throttle: atomically records one `kind` for `subject`, or throws RATE_LIMITED
 * with `retry_at` (when this subject's own oldest counted event leaves the
 * window) if it already did `kind` `max` times. Blocked attempts are not recorded.
 */
export async function rateLimit(admin: Admin, subject: string, kind: string, max: number, windowMin: number, message: string) {
  const { data, error } = await admin.rpc("demo_rate_take", {
    p_subject: subject, p_kind: kind, p_max: max, p_window_minutes: windowMin,
  });
  if (error) throw fromDbError(error);
  const r = (data ?? {}) as { ok?: boolean; retry_at?: string | null };
  if (!r.ok) throw new ApiError("RATE_LIMITED", message, { retry_at: r.retry_at ?? null });
}

/** Rate-limit subject for actions inside one sandbox lease. */
export const leaseSubject = (lease: Lease) => `lease:${lease.hash.slice(0, 32)}`;

export function ok(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}

/**
 * Resets ONE sandbox slot to the synthetic fixture and clears the Space-creation
 * limits of that slot's synthetic personas. Callers must hold (or have just
 * acquired) this slot's lease. Never touches production users or other slots.
 */
export async function resetSandbox(admin: Admin, slot: number) {
  const { data, error } = await admin.rpc("demo_reset_slot", { p_slot: slot, p_fixture: demoFixture() });
  if (error) {
    console.error("[demo] reset failed", slot, error.message);
    throw new ApiError("INTERNAL", "Demo data could not be prepared.");
  }
  const { data: cleared, error: clearErr } = await admin.rpc("demo_clear_create_limits", { p_slot: slot });
  if (clearErr) {
    console.error("[demo] clearing demo rate limits failed", slot, clearErr.message);
    throw new ApiError("INTERNAL", "Demo data could not be prepared.");
  }
  return { ...(data as { personas: number; participations: number }), cleared_create_limits: cleared as number };
}
