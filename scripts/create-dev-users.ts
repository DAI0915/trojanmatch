/**
 * Creates (or updates) two CONFIRMED development test accounts so the Space
 * join flow can be tested while public sign-up is disabled.
 *
 * Uses only supported Supabase Auth admin APIs (no writes to auth.* tables).
 * Usage:  npx tsx scripts/create-dev-users.ts [--env .env.local]
 * Needs:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEV_TEST_PASSWORD
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const envFile = process.argv.includes("--env")
  ? process.argv[process.argv.indexOf("--env") + 1]
  : ".env.local";
config({ path: envFile, quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEV_TEST_PASSWORD;
if (!url || !serviceKey || !password || password.length < 12) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEV_TEST_PASSWORD (12+ chars).");
  process.exit(1);
}

export const DEV_USERS = [
  { email: "dev1@trojanmatch.test", displayName: "Dev Tester A" },
  { email: "dev2@trojanmatch.test", displayName: "Dev Tester B" },
] as const;

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  console.log(`Target: ${new URL(url!).host}`);
  for (const u of DEV_USERS) {
    const existingId = await findUserIdByEmail(u.email);
    if (existingId) {
      const { error } = await admin.auth.admin.updateUserById(existingId, {
        password,
        email_confirm: true,
        user_metadata: { display_name: u.displayName },
      });
      if (error) throw error;
      console.log(`updated   ${u.email} (${existingId})`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: u.email,
        password,
        email_confirm: true, // pre-confirmed: no email delivery required
        user_metadata: { display_name: u.displayName },
        // scope defaults to 'prod' in the handle_new_user trigger
      });
      if (error) throw error;
      console.log(`created   ${u.email} (${data.user.id})`);
    }
  }
  console.log("Done. Password is DEV_TEST_PASSWORD from your env file (not printed).");
}

main().catch((err) => {
  console.error("Failed:", err.message ?? err);
  process.exit(1);
});
