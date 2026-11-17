import pg from "pg";
import { config } from "dotenv";

/**
 * Runs once before all E2E workers. Local runs only: release demo sandbox leases
 * left behind by an earlier interrupted run so the small local pool is free.
 * Never touches a non-local database or a non-local target.
 */
export default async function globalSetup() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.SUPABASE_DB_URL;
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const local = /localhost|127\.0\.0\.1/;
  if (!url || !local.test(url) || !local.test(base)) return;
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  await db.query(`update private.demo_slots set lease_token_hash = null, leased_until = null where slot >= 1`);
  await db.end();
}
