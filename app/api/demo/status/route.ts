import { currentLease, ok, withDemo } from "@/lib/demo/server";

/** GET /api/demo/status — whether THIS browser holds an active sandbox lease. */
export const GET = withDemo(async ({ cfg, admin }) => {
  const lease = await currentLease(cfg, admin);
  return ok({ lease: !!lease, leased_until: lease?.leasedUntil ?? null });
});
