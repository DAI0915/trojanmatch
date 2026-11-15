import "server-only";
import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { ApiError } from "@/lib/api/errors";
import { errorResponse } from "@/lib/api/handler";
import { isAllowedOrigin } from "@/lib/api/origin";
import { publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { demoAdminClient } from "./admin";
import { demoConfig } from "./config";
import { personaPassword, sha256Hex } from "./crypto";
import { LEASE_COOKIE, PRESENTER_SLOT, formatLeaseCookie, parseLeaseCookie, personaEmail } from "./personas";

type Cfg = NonNullable<ReturnType<typeof demoConfig>>;
type Admin = ReturnType<typeof demoAdminClient>;
export type DemoContext = { req: NextRequest; cfg: Cfg; admin: Admin };

/** Demo route wrapper: 404 unless Demo Mode is fully configured; Origin-checked. */
export function withDemo(handler: (ctx: DemoContext) => Promise<Response>) {
  return async (req: NextRequest) => {
    try {
      const cfg = demoConfig();
      if (!cfg) throw new ApiError("DEMO_DISABLED", "Demo Mode is not available.");
      if (!isAllowedOrigin(req.method, req.headers, publicEnv.NEXT_PUBLIC_APP_URL)) {
        throw new ApiError("FORBIDDEN_ORIGIN", "Cross-origin request rejected.");
      }
      return await handler({ req, cfg, admin: demoAdminClient(cfg.SUPABASE_SERVICE_ROLE_KEY) });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Throws DEMO_LEASE_INVALID unless the request carries the current presenter lease. */
export async function requireLease(admin: Admin) {
  const store = await cookies();
  const lease = parseLeaseCookie(store.get(LEASE_COOKIE)?.value);
  if (!lease || lease.slot !== PRESENTER_SLOT) {
    throw new ApiError("DEMO_LEASE_INVALID", "Start the demo with the presenter code first.");
  }
  const { data, error } = await admin.rpc("demo_check_lease", {
    p_slot: lease.slot,
    p_token_hash: sha256Hex(lease.token),
  });
  if (error || !(data as { valid?: boolean })?.valid) {
    throw new ApiError("DEMO_LEASE_INVALID", "This demo session has ended. Start it again.");
  }
  return { ...lease, hash: sha256Hex(lease.token) };
}

export async function setLeaseCookie(slot: number, token: string, minutes: number) {
  const store = await cookies();
  store.set(LEASE_COOKIE, formatLeaseCookie(slot, token), {
    httpOnly: true,
    secure: publicEnv.NEXT_PUBLIC_APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: minutes * 60,
  });
}

export async function clearLeaseCookie() {
  const store = await cookies();
  store.delete(LEASE_COOKIE);
}

/**
 * Signs the browser in as an allowlisted persona using supported Auth APIs.
 * The email is derived from the persona key; the password is derived server-side.
 */
export async function signInAsPersona(cfg: Cfg, key: string) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  const email = personaEmail(key, PRESENTER_SLOT);
  const { error } = await supabase.auth.signInWithPassword({ email, password: personaPassword(cfg.DEMO_PERSONA_SECRET, email) });
  if (error) {
    console.error("[demo] persona sign-in failed", key, error.code);
    throw new ApiError("INTERNAL", "Demo persona is not set up. Run the seed script.");
  }
}

/** Salted hash of the client IP for throttling (raw IPs are never stored). */
export async function clientSubject(cfg: Cfg) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return `demo:${sha256Hex(`${cfg.DEMO_PERSONA_SECRET}|${ip}`).slice(0, 32)}`;
}

export function ok(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}
