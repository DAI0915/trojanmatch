import { z } from "zod";
import { fromDbError } from "@/lib/api/errors";
import { parseJson } from "@/lib/api/handler";
import { PRESENTER_SLOT } from "@/lib/demo/personas";
import { ok, requireLease, withDemo } from "@/lib/demo/server";

/**
 * POST /api/demo/simulate-joins {spaceId, count} — valid lease required. The RPC
 * only accepts Spaces in the presenter's demo scope and joins synthetic personas
 * through the normal join rules (status, policy, join code).
 */
export const POST = withDemo(async ({ req, admin }) => {
  await requireLease(admin);
  const { spaceId, count } = await parseJson(
    req,
    z.object({ spaceId: z.uuid(), count: z.number().int().min(1).max(40).default(12) }),
  );
  const { data, error } = await admin.rpc("demo_simulate_joins", { p_slot: PRESENTER_SLOT, p_space_id: spaceId, p_count: count });
  if (error) throw fromDbError(error);
  return ok(data);
});
