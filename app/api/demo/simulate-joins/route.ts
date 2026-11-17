import { z } from "zod";
import { fromDbError } from "@/lib/api/errors";
import { parseJson } from "@/lib/api/handler";
import { leaseSubject, ok, rateLimit, requireLease, withDemo } from "@/lib/demo/server";

/**
 * POST /api/demo/simulate-joins {spaceId, count} — valid lease required. The RPC
 * only accepts Spaces in THIS visitor's sandbox scope and joins synthetic
 * personas through the normal join rules (status, policy, join code).
 */
export const POST = withDemo(async ({ req, cfg, admin }) => {
  const lease = await requireLease(cfg, admin);
  const { spaceId, count } = await parseJson(
    req,
    z.object({ spaceId: z.uuid(), count: z.number().int().min(1).max(40).default(12) }),
  );
  await rateLimit(admin, leaseSubject(lease), "demo_simulate", 30, 60, "Too many simulated joins. Please try again later.");
  const { data, error } = await admin.rpc("demo_simulate_joins", { p_slot: lease.slot, p_space_id: spaceId, p_count: count });
  if (error) throw fromDbError(error);
  return ok(data);
});
