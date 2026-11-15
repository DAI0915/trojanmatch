import { cookies } from "next/headers";
import { sha256Hex } from "@/lib/demo/crypto";
import { LEASE_COOKIE, parseLeaseCookie } from "@/lib/demo/personas";
import { clearLeaseCookie, ok, withDemo } from "@/lib/demo/server";
import { createClient } from "@/lib/supabase/server";

/** POST /api/demo/end — releases the lease (if this browser holds it) and signs out locally. */
export const POST = withDemo(async ({ admin }) => {
  const lease = parseLeaseCookie((await cookies()).get(LEASE_COOKIE)?.value);
  if (lease) await admin.rpc("demo_end_lease", { p_slot: lease.slot, p_token_hash: sha256Hex(lease.token) });
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  await clearLeaseCookie();
  return ok({ ok: true });
});
