import { cookies } from "next/headers";
import { sha256Hex } from "@/lib/demo/crypto";
import { LEASE_COOKIE, parseLeaseCookie } from "@/lib/demo/personas";
import { ok, withDemo } from "@/lib/demo/server";

/** GET /api/demo/status — whether THIS browser holds a valid presenter lease. */
export const GET = withDemo(async ({ admin }) => {
  const lease = parseLeaseCookie((await cookies()).get(LEASE_COOKIE)?.value);
  if (!lease) return ok({ lease: false });
  const { data } = await admin.rpc("demo_check_lease", { p_slot: lease.slot, p_token_hash: sha256Hex(lease.token) });
  const d = (data ?? {}) as { valid?: boolean; leased_until?: string };
  return ok({ lease: !!d.valid, leased_until: d.valid ? d.leased_until : null });
});
