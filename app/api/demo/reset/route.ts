import { ApiError } from "@/lib/api/errors";
import { demoFixture } from "@/lib/demo/fixtures";
import { PRESENTER_SLOT } from "@/lib/demo/personas";
import { ok, requireLease, withDemo } from "@/lib/demo/server";

export const maxDuration = 30;

/** POST /api/demo/reset — valid lease required; resets ONLY the presenter slot. */
export const POST = withDemo(async ({ admin }) => {
  await requireLease(admin);
  const { data, error } = await admin.rpc("demo_reset_slot", { p_slot: PRESENTER_SLOT, p_fixture: demoFixture() });
  if (error) {
    console.error("[demo] reset failed", error.message);
    throw new ApiError("INTERNAL", "Reset failed.");
  }
  const r = data as { personas: number; participations: number };
  return ok({ ok: true, personas: r.personas, participations: r.participations });
});
