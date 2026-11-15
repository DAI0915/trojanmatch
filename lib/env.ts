import { z } from "zod";

/**
 * Public env (inlined into the client bundle). Only RLS-bound values belong here.
 * NEXT_PUBLIC_* must be referenced literally so Next.js can inline them.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

const flag = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

/** Server-only flags. Never import this from a client component. */
export function serverFlags() {
  return z
    .object({
      PUBLIC_SIGNUP_ENABLED: flag,
      DEMO_MODE_ENABLED: flag,
    })
    .parse({
      PUBLIC_SIGNUP_ENABLED: process.env.PUBLIC_SIGNUP_ENABLED,
      DEMO_MODE_ENABLED: process.env.DEMO_MODE_ENABLED,
    });
}
