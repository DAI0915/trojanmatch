import { ok, leaseSubject, rateLimit, requireLease, resetSandbox, signInAsPersona, withDemo } from "@/lib/demo/server";

export const maxDuration = 30;

/**
 * POST /api/demo/reset — valid lease required. Restores ONLY this
 * visitor's own sandbox slot, renews their lease, and signs back in as Jordan.
 * Other visitors' sandboxes are never touched.
 */
export const POST = withDemo(async ({ cfg, admin }) => {
  const lease = await requireLease(cfg, admin);
  await rateLimit(admin, leaseSubject(lease), "demo_reset", 6, 60, "This demo was restarted several times recently. Please try again later.");
  const r = await resetSandbox(admin, lease.slot);
  const { data } = await admin.rpc("demo_renew_lease", { p_slot: lease.slot, p_token_hash: lease.hash, p_minutes: cfg.DEMO_LEASE_MINUTES });
  await signInAsPersona(cfg, lease.slot, "jordan");
  return ok({
    ok: true,
    leased_until: (data as { leased_until?: string } | null)?.leased_until ?? null,
    cleared_create_limits: r.cleared_create_limits,
  });
});
