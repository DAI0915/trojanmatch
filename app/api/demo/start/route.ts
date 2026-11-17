import { ApiError, fromDbError } from "@/lib/api/errors";
import { newLeaseToken, sha256Hex } from "@/lib/demo/crypto";
import {
  clientSubject, currentLease, ok, rateLimit, resetSandbox, setLeaseCookie, signInAsPersona, withDemo,
} from "@/lib/demo/server";
import { scopeSlot } from "@/lib/demo/personas";
import { getCurrentUser } from "@/lib/supabase/server";

export const maxDuration = 30;

type Acquire = { ok: boolean; slot?: number; leased_until?: string; error?: "BUSY" | "TOO_MANY_SESSIONS"; retry_at?: string | null };

/**
 * POST /api/demo/start — UNAUTHENTICATED, password-free bootstrap.
 *
 * - If this browser already holds an active sandbox lease, it simply resumes it.
 * - Otherwise it leases a FREE sandbox slot from the pool (never one another
 *   visitor is using), resets only that slot to the synthetic fixture, signs in
 *   as Jordan (synthetic) and sets an httpOnly lease cookie.
 *
 * Abuse controls: Origin check, DEMO_STARTS_PER_HOUR per salted IP hash, at most
 * DEMO_MAX_SESSIONS_PER_VISITOR active sandboxes per visitor, and a finite pool.
 */
export const POST = withDemo(async ({ cfg, admin }) => {
  const existing = await currentLease(cfg, admin);
  if (existing) {
    const { user } = await getCurrentUser();
    const userSlot = scopeSlot((user?.app_metadata as { scope?: string } | undefined)?.scope);
    if (userSlot !== existing.slot) await signInAsPersona(cfg, existing.slot, "jordan");
    return ok({ ok: true, resumed: true, leased_until: existing.leasedUntil });
  }

  const subject = await clientSubject(cfg);
  await rateLimit(admin, subject, "demo_start", cfg.DEMO_STARTS_PER_HOUR, 60, "You've started several demos recently. Please try again later.");

  const token = newLeaseToken();
  const hash = sha256Hex(token);
  const { data, error } = await admin.rpc("demo_acquire_slot", {
    p_max_slot: cfg.DEMO_SLOTS, p_token_hash: hash, p_minutes: cfg.DEMO_LEASE_MINUTES,
    p_subject: subject, p_max_per_subject: cfg.DEMO_MAX_SESSIONS_PER_VISITOR,
  });
  if (error) throw fromDbError(error);
  const r = data as Acquire;
  if (!r.ok || !r.slot) {
    if (r.error === "TOO_MANY_SESSIONS") {
      throw new ApiError("RATE_LIMITED", "You already have demo sessions open in other browsers. Use one of them, or try again later.");
    }
    throw new ApiError("DEMO_BUSY", "All demo sandboxes are in use right now. Please try again in a few minutes.", { retry_at: r.retry_at ?? null });
  }

  try {
    await resetSandbox(admin, r.slot);
    await signInAsPersona(cfg, r.slot, "jordan");
  } catch (e) {
    await admin.rpc("demo_end_lease", { p_slot: r.slot, p_token_hash: hash });
    throw e;
  }
  await setLeaseCookie(r.slot, token, cfg.DEMO_LEASE_MINUTES);
  return ok({ ok: true, resumed: false, leased_until: r.leased_until });
});
