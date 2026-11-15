import { z } from "zod";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { parseJson } from "@/lib/api/handler";
import { newLeaseToken, secretsEqual, sha256Hex } from "@/lib/demo/crypto";
import { demoFixture } from "@/lib/demo/fixtures";
import { PRESENTER_SLOT } from "@/lib/demo/personas";
import { clientSubject, ok, setLeaseCookie, signInAsPersona, withDemo } from "@/lib/demo/server";

export const maxDuration = 30;

/**
 * POST /api/demo/start {code} — UNAUTHENTICATED bootstrap for the presenter
 * sandbox. Requires the presenter code (constant-time compare, throttled per
 * salted IP). Leases slot 0, resets it to the synthetic fixture, signs in as
 * Jordan, and sets an httpOnly lease cookie. Never touches production data.
 */
export const POST = withDemo(async ({ req, cfg, admin }) => {
  const { code } = await parseJson(req, z.object({ code: z.string().trim().min(1).max(100) }));
  const subject = await clientSubject(cfg);

  const { data: limited, error: rateErr } = await admin.rpc("demo_rate_exceeded", {
    p_subject: subject, p_kind: "demo_start_failed", p_max: 15, p_window_minutes: 60,
  });
  if (rateErr) throw fromDbError(rateErr);
  if (limited) throw new ApiError("RATE_LIMITED", "Too many incorrect codes. Try again later.");

  if (!secretsEqual(code, cfg.DEMO_PRESENTER_CODE)) {
    await admin.rpc("demo_rate_record", { p_subject: subject, p_kind: "demo_start_failed" });
    throw new ApiError("INVALID_CODE", "Incorrect presenter code.");
  }

  const token = newLeaseToken();
  const { data: lease, error: leaseErr } = await admin.rpc("demo_start_lease", {
    p_slot: PRESENTER_SLOT, p_token_hash: sha256Hex(token), p_minutes: cfg.DEMO_LEASE_MINUTES,
  });
  if (leaseErr) throw fromDbError(leaseErr);

  const { error: resetErr } = await admin.rpc("demo_reset_slot", { p_slot: PRESENTER_SLOT, p_fixture: demoFixture() });
  if (resetErr) {
    console.error("[demo] reset failed", resetErr.message);
    throw new ApiError("INTERNAL", "Demo data could not be prepared.");
  }

  await signInAsPersona(cfg, "jordan");
  await setLeaseCookie(PRESENTER_SLOT, token, cfg.DEMO_LEASE_MINUTES);
  return ok({ ok: true, persona: "jordan", leased_until: (lease as { leased_until: string }).leased_until });
});
