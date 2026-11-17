/**
 * Seeds the public demo sandbox POOL (slots 1..N): for each slot creates/updates
 * ~44 CONFIRMED synthetic auth users, registers them as that slot's personas,
 * then loads the fixture. Each slot is an isolated scope 'demo:<n>'.
 *
 * - Uses only supported Supabase Auth admin APIs (no writes to auth.* tables).
 * - Personas get app_metadata { scope: 'demo:0', is_synthetic: true }; emails use
 *   the reserved .invalid TLD, so they can never receive mail or self-register.
 * - Passwords are HMAC(DEMO_PERSONA_SECRET, email): never printed or stored.
 * - Idempotent: safe to re-run.
 *
 * Usage: npx tsx scripts/seed-demo.ts [--env .env.local] [--slots 1-4] [--no-reset]
 *   --slots: a range "1-10" or list "1,2,5" (default: 1..DEMO_SLOTS, or 1..4).
 *   Slot 0 is the legacy presenter slot and is not part of the public pool.
 * Needs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_PERSONA_SECRET
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { DEMO_PERSONAS, demoFixture } from "../lib/demo/fixtures";
import { MAX_POOL_SLOTS, SWITCHABLE_PERSONAS, personaEmail } from "../lib/demo/personas";
import { personaPassword } from "../lib/demo/password";

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
config({ path: arg("--env") ?? ".env.local", quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.DEMO_PERSONA_SECRET;
if (!url || !serviceKey || !secret || secret.length < 32) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEMO_PERSONA_SECRET (32+ chars).");
  process.exit(1);
}

function parseSlots(spec: string | undefined): number[] {
  const fallback = Math.min(Math.max(Number(process.env.DEMO_SLOTS) || 4, 1), MAX_POOL_SLOTS);
  const raw = spec ?? `1-${fallback}`;
  const out = new Set<number>();
  for (const part of raw.split(",")) {
    const [a, b] = part.split("-").map((x) => Number(x.trim()));
    for (let n = a; n <= (Number.isFinite(b) ? b : a); n++) out.add(n);
  }
  const slots = [...out].sort((x, y) => x - y);
  if (!slots.length || slots.some((n) => !Number.isInteger(n) || n < 0 || n > MAX_POOL_SLOTS)) {
    console.error(`Invalid --slots "${raw}" (use e.g. 1-10 or 1,2,3; 0..${MAX_POOL_SLOTS}).`);
    process.exit(1);
  }
  return slots;
}
const slots = parseSlots(arg("--slots"));
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const switchable = new Set<string>(SWITCHABLE_PERSONAS.map((p) => p.key));

async function existingUsers(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email) map.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 200) break;
  }
  return map;
}

async function main() {
  console.log(`Target: ${new URL(url!).host} · slots ${slots.join(", ")}`);
  const existing = await existingUsers();
  for (const slot of slots) await seedSlot(slot, existing);
}

async function seedSlot(slot: number, existing: Map<string, string>) {
  const scope = `demo:${slot}`;
  const registry: { persona_key: string; user_id: string; switchable: boolean }[] = [];
  let created = 0;
  let updated = 0;

  for (const p of DEMO_PERSONAS) {
    const email = personaEmail(p.key, slot);
    const attrs = {
      password: personaPassword(secret!, email),
      email_confirm: true,
      user_metadata: { display_name: p.display_name },
      app_metadata: { scope, is_synthetic: true },
    };
    const id = existing.get(email);
    if (id) {
      const { error } = await admin.auth.admin.updateUserById(id, attrs);
      if (error) throw new Error(`${p.key}: ${error.message}`);
      registry.push({ persona_key: p.key, user_id: id, switchable: switchable.has(p.key) });
      updated++;
    } else {
      const { data, error } = await admin.auth.admin.createUser({ email, ...attrs });
      if (error) throw new Error(`${p.key}: ${error.message}`);
      registry.push({ persona_key: p.key, user_id: data.user.id, switchable: switchable.has(p.key) });
      created++;
    }
  }
  console.log(`[${scope}] personas: ${created} created, ${updated} updated`);

  const { data: n, error: regErr } = await admin.rpc("demo_register_personas", { p_slot: slot, p_personas: registry });
  if (regErr) throw new Error(`register: ${regErr.message}`);
  console.log(`registered ${n} personas in ${scope}`);

  if (!process.argv.includes("--no-reset")) {
    const { data, error } = await admin.rpc("demo_reset_slot", { p_slot: slot, p_fixture: demoFixture() });
    if (error) throw new Error(`reset: ${error.message}`);
    const r = data as { personas: number; participations: number; teams: number; spaces: Record<string, unknown> };
    console.log(`fixture loaded: ${r.personas} personas, ${Object.keys(r.spaces).length} spaces, ${r.participations} participations, ${r.teams} teams`);
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
