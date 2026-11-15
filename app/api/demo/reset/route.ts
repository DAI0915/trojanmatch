import { ok, requireLease, resetSandbox, withDemo } from "@/lib/demo/server";

export const maxDuration = 30;

/**
 * POST /api/demo/reset — valid presenter lease required. Resets ONLY the
 * presenter slot and clears that slot's synthetic personas' Space-creation limits.
 */
export const POST = withDemo(async ({ admin }) => {
  await requireLease(admin);
  const r = await resetSandbox(admin);
  return ok({ ok: true, personas: r.personas, participations: r.participations, cleared_create_limits: r.cleared_create_limits });
});
