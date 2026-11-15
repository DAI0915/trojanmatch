import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const db = process.env.SUPABASE_DB_URL ?? "";
// Integration tests create and delete users/rows. Never run them against a
// remote project unless explicitly allowed.
const isLocal = (u: string) => /(127\.0\.0\.1|localhost)/.test(u);
if (!process.env.ALLOW_REMOTE_INTEGRATION_TESTS && (!isLocal(url) || !isLocal(db))) {
  throw new Error("Integration tests must target local Supabase (set ALLOW_REMOTE_INTEGRATION_TESTS to override).");
}
