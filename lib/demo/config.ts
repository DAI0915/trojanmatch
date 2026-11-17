import "server-only";
import { z } from "zod";

/**
 * Server-only demo configuration. Returns null (Demo Mode off) if misconfigured.
 *
 * The public demo needs no access code: each visitor leases one of DEMO_SLOTS
 * isolated sandboxes (slots 1..N, each pre-seeded with its own synthetic
 * personas by scripts/seed-demo.ts).
 */
export function demoConfig() {
  const parsed = z
    .object({
      DEMO_MODE_ENABLED: z.literal("true"),
      DEMO_PERSONA_SECRET: z.string().min(32),
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
      /** Number of public sandboxes (slots 1..N). */
      DEMO_SLOTS: z.coerce.number().int().min(1).max(20).default(4),
      /** Hard lease length. Idle leases (30 min without a request) are reclaimed earlier. */
      DEMO_LEASE_MINUTES: z.coerce.number().int().min(5).max(240).default(60),
      /** New sandboxes per visitor (salted IP hash) per hour. */
      DEMO_STARTS_PER_HOUR: z.coerce.number().int().min(1).max(100).default(6),
      /** Simultaneously active sandboxes per visitor. */
      DEMO_MAX_SESSIONS_PER_VISITOR: z.coerce.number().int().min(1).max(10).default(2),
    })
    .safeParse({
      DEMO_MODE_ENABLED: process.env.DEMO_MODE_ENABLED,
      DEMO_PERSONA_SECRET: process.env.DEMO_PERSONA_SECRET,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      DEMO_SLOTS: process.env.DEMO_SLOTS || undefined,
      DEMO_LEASE_MINUTES: process.env.DEMO_LEASE_MINUTES || undefined,
      DEMO_STARTS_PER_HOUR: process.env.DEMO_STARTS_PER_HOUR || undefined,
      DEMO_MAX_SESSIONS_PER_VISITOR: process.env.DEMO_MAX_SESSIONS_PER_VISITOR || undefined,
    });
  return parsed.success ? parsed.data : null;
}
