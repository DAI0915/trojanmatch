import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client. ONLY for app/api/demo/* and scripts/* (ESLint enforces).
 * It calls service_role-only demo RPCs; every one of them derives its scope
 * from a slot number and can never touch 'prod' rows.
 */
export function demoAdminClient(serviceRoleKey: string) {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
