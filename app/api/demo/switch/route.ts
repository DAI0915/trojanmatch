import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { parseJson } from "@/lib/api/handler";
import { parsePersonaEmail } from "@/lib/demo/personas";
import { isDemoPersonaKey, leaseSubject, ok, rateLimit, requireLease, signInAsPersona, withDemo } from "@/lib/demo/server";

/**
 * POST /api/demo/switch {persona} | {userId} — valid lease required.
 * Signs this browser in as another synthetic persona of THE SAME sandbox slot.
 * `userId` (e.g. "act as this invitee") is resolved server-side via the Auth
 * admin API and accepted only if it is a synthetic persona of this lease's slot.
 */
export const POST = withDemo(async ({ req, cfg, admin }) => {
  const lease = await requireLease(cfg, admin);
  const body = await parseJson(
    req,
    z.union([z.object({ persona: z.string().max(32) }), z.object({ userId: z.uuid() })]),
  );
  let key: string | null = null;
  if ("persona" in body) {
    key = body.persona;
  } else {
    const { data } = await admin.auth.admin.getUserById(body.userId);
    const parsed = parsePersonaEmail(data?.user?.email);
    if (parsed && parsed.slot === lease.slot) key = parsed.key;
  }
  if (!isDemoPersonaKey(key)) throw new ApiError("INVALID_INPUT", "Unknown persona.");
  await rateLimit(admin, leaseSubject(lease), "demo_switch", 120, 60, "Too many persona switches. Please slow down.");
  await signInAsPersona(cfg, lease.slot, key);
  return ok({ ok: true, persona: key });
});
