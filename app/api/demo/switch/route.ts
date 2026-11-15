import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { parseJson } from "@/lib/api/handler";
import { isSwitchablePersona } from "@/lib/demo/personas";
import { ok, requireLease, signInAsPersona, withDemo } from "@/lib/demo/server";

/** POST /api/demo/switch {persona} — valid lease + allowlisted persona key only. */
export const POST = withDemo(async ({ req, cfg, admin }) => {
  await requireLease(admin);
  const { persona } = await parseJson(req, z.object({ persona: z.string().max(32) }));
  if (!isSwitchablePersona(persona)) throw new ApiError("INVALID_INPUT", "Unknown persona.");
  await signInAsPersona(cfg, persona);
  return ok({ ok: true, persona });
});
