import "server-only";
import { z } from "zod";

/** Server-only demo configuration. Throws a generic error if misconfigured. */
export function demoConfig() {
  const parsed = z
    .object({
      DEMO_MODE_ENABLED: z.literal("true"),
      DEMO_PRESENTER_CODE: z.string().min(8),
      DEMO_PERSONA_SECRET: z.string().min(32),
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
      DEMO_LEASE_MINUTES: z.coerce.number().int().min(5).max(480).default(120),
    })
    .safeParse({
      DEMO_MODE_ENABLED: process.env.DEMO_MODE_ENABLED,
      DEMO_PRESENTER_CODE: process.env.DEMO_PRESENTER_CODE,
      DEMO_PERSONA_SECRET: process.env.DEMO_PERSONA_SECRET,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      DEMO_LEASE_MINUTES: process.env.DEMO_LEASE_MINUTES || undefined,
    });
  return parsed.success ? parsed.data : null;
}
