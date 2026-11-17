/**
 * Public demo POOL (migration 0011): per-visitor sandbox leases, idle reclaim,
 * cross-slot isolation, restart isolation and the demo Gemini budget.
 *
 * Uses TEST slots 17–19 with their own synthetic personas. Any other eligible
 * slots in 1..16 (e.g. locally seeded sandboxes) are marked busy for the
 * duration of the test and restored afterwards, so acquisitions are
 * deterministic and real sandboxes are never handed out or reset.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { adminClient, anonClient, createTestUser, dbClient, deleteTestUsers, type TestUser } from "./helpers";

const SLOTS = [17, 18, 19] as const;
const MAX = 19;
const keys = ["jordan", "maya", "priya", "alex"];
const TAG = Array.from(randomBytes(4), (b) => String.fromCharCode(97 + (b % 26))).join("");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const tok = () => randomBytes(32).toString("base64url");
const subject = () => `demo:${randomBytes(16).toString("hex")}`;

let db: pg.Client;
const people = new Map<number, TestUser[]>(); // slot -> personas (index 0 = jordan)
let prodUser: TestUser;
let savedSlots: Record<string, unknown>[] = [];

function fixture(slot: number) {
  return {
    personas: keys.map((k, i) => ({
      key: k, display_name: `Synthetic ${k} ${slot}`, university: "USC", bio: "Synthetic demo persona.",
      skills: ["python"], roles: i % 2 ? ["frontend"] : ["backend"], interests: ["education"], experience: "intermediate",
      working_style: { sync: "mixed" }, availability: [20, 21, 22], timezone: "America/Los_Angeles",
      hackathon_goal: "build", course_goal: "aim_a", sim_rank: i + 1,
    })),
    spaces: [{
      key: "hack", type: "hackathon", title: `PoolFest ${TAG} ${slot} 2026`, visibility: "public", creator: "maya",
      min_team_size: 2, max_team_size: 4, team_size_source: "app_default",
      hackathon: { edition_year: 2026, organizer: "Test", official_url: null, start_date: "2026-11-14", end_date: "2026-11-15", timezone: "America/Los_Angeles", format: "in_person", location: "LA", rules_url: null },
      course: null,
    }],
    participations: [
      { space: "hack", persona: "jordan", goal: "build", desired_roles: ["backend"], topics: [], looking_for_team: true, accept_invites: true, smart_match_opt_in: true, visible_to_members: true, notes: null },
    ],
  };
}

const acquire = (token: string, subj: string, maxPer = 2) =>
  adminClient().rpc("demo_acquire_slot", { p_max_slot: MAX, p_token_hash: hash(token), p_minutes: 30, p_subject: subj, p_max_per_subject: maxPer });

async function spaceCount(slot: number) {
  const { rows } = await db.query(`select count(*)::int as n from public.matching_spaces where scope = $1`, [`demo:${slot}`]);
  return rows[0].n as number;
}

beforeAll(async () => {
  db = await dbClient();
  const { rows } = await db.query(`select * from private.demo_slots where slot between 1 and 16`);
  savedSlots = rows;
  await db.query(
    `update private.demo_slots set lease_token_hash = repeat('0', 64), leased_until = now() + interval '1 hour',
            last_seen_at = now(), updated_at = now() where slot between 1 and 16`);
  // Slots 1..16 that have personas but no row yet would be inserted by acquire; pre-create them busy.
  await db.query(
    `insert into private.demo_slots (slot, lease_token_hash, leased_until, last_seen_at)
     select distinct dp.slot, repeat('0', 64), now() + interval '1 hour', now() from private.demo_personas dp
     where dp.slot between 1 and 16 on conflict (slot) do nothing`);
  await db.query(`delete from private.demo_slots where slot = any($1)`, [[...SLOTS]]);

  const admin = adminClient();
  for (const slot of SLOTS) {
    const users = await Promise.all(
      keys.map((k) => createTestUser({ displayName: `Synthetic ${k} ${slot}`, appMetadata: { scope: `demo:${slot}`, is_synthetic: true } })),
    );
    people.set(slot, users);
    const { error } = await admin.rpc("demo_register_personas", {
      p_slot: slot, p_personas: users.map((u, i) => ({ persona_key: keys[i], user_id: u.id, switchable: true })),
    });
    expect(error).toBeNull();
    const { error: resetErr } = await admin.rpc("demo_reset_slot", { p_slot: slot, p_fixture: fixture(slot) });
    expect(resetErr).toBeNull();
  }
  prodUser = await createTestUser({ displayName: "Real Student" });
});

afterAll(async () => {
  await db.query(`delete from public.matching_spaces where scope = any($1)`, [SLOTS.map((s) => `demo:${s}`)]);
  await db.query(`delete from private.demo_slots where slot = any($1)`, [[...SLOTS]]);
  await db.query(`delete from private.api_events where kind = 'demo_ai_kickoff' and (subject like any($1) or subject = 'demo:16#test')`,
    [SLOTS.map((s) => `demo:${s}#%`)]);
  await db.query(`delete from private.demo_slots where slot between 1 and 16`);
  for (const r of savedSlots) {
    await db.query(
      `insert into private.demo_slots (slot, lease_token_hash, leased_until, epoch, updated_at, holder_subject, started_at, last_seen_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [r.slot, r.lease_token_hash, r.leased_until, r.epoch, r.updated_at, r.holder_subject, r.started_at, r.last_seen_at],
    );
  }
  await deleteTestUsers([...[...people.values()].flat(), prodUser]);
  await db?.end();
});

describe("demo pool leases", () => {
  const tokens: string[] = [];
  const slotsGiven: number[] = [];

  it("gives simultaneous visitors DIFFERENT free slots, then reports BUSY", async () => {
    for (let i = 0; i < 3; i++) {
      const t = tok();
      const { data, error } = await acquire(t, subject());
      expect(error).toBeNull();
      const r = data as { ok: boolean; slot: number };
      expect(r.ok).toBe(true);
      tokens.push(t);
      slotsGiven.push(r.slot);
    }
    expect([...slotsGiven].sort()).toEqual([17, 18, 19]);

    const { data } = await acquire(tok(), subject());
    expect(data).toMatchObject({ ok: false, error: "BUSY" });
    expect((data as { retry_at: string | null }).retry_at).not.toBeNull();
  });

  it("concurrent acquisitions never share a slot", async () => {
    for (const s of SLOTS) await adminClient().rpc("demo_end_lease", { p_slot: s, p_token_hash: hash(tokens[slotsGiven.indexOf(s)]) });
    const ts = [tok(), tok(), tok(), tok(), tok()];
    const results = await Promise.all(ts.map((t) => acquire(t, subject())));
    const okSlots = results.map((r) => r.data as { ok: boolean; slot?: number }).filter((r) => r.ok).map((r) => r.slot);
    expect(okSlots).toHaveLength(3);
    expect(new Set(okSlots).size).toBe(3);
    tokens.length = 0;
    slotsGiven.length = 0;
    results.forEach((r, i) => {
      const d = r.data as { ok: boolean; slot?: number };
      if (d.ok && d.slot) {
        tokens.push(ts[i]);
        slotsGiven.push(d.slot);
      }
    });
  });

  it("each lease is valid only for its own slot (no cross-sandbox access)", async () => {
    const [a, b] = [slotsGiven[0], slotsGiven[1]];
    const userA = people.get(a)![0];
    const admin = adminClient();
    expect((await admin.rpc("demo_check_lease", { p_slot: a, p_token_hash: hash(tokens[0]) })).data).toMatchObject({ valid: true });
    expect((await admin.rpc("demo_check_lease", { p_slot: b, p_token_hash: hash(tokens[0]) })).data).toEqual({ valid: false });
    expect((await userA.client.rpc("demo_lease_valid", { p_token_hash: hash(tokens[0]) })).data).toBe(true);
    expect((await userA.client.rpc("demo_lease_valid", { p_token_hash: hash(tokens[1]) })).data).toBe(false);
    expect((await prodUser.client.rpc("demo_lease_valid", { p_token_hash: hash(tokens[0]) })).data).toBe(false);
  });

  it("limits simultaneous sandboxes per visitor", async () => {
    const s = subject();
    for (const slot of SLOTS) await adminClient().rpc("demo_end_lease", { p_slot: slot, p_token_hash: hash(tokens[slotsGiven.indexOf(slot)]) });
    expect((await acquire(tok(), s, 1)).data).toMatchObject({ ok: true });
    expect((await acquire(tok(), s, 1)).data).toEqual({ ok: false, error: "TOO_MANY_SESSIONS" });
    expect((await acquire(tok(), subject(), 1)).data).toMatchObject({ ok: true }); // someone else is fine
  });

  it("activity keeps a lease alive; 30 idle minutes free the slot for the next visitor", async () => {
    for (const slot of SLOTS) await db.query(`update private.demo_slots set lease_token_hash = null, leased_until = null where slot = $1`, [slot]);
    const t = tok();
    const slot = (((await acquire(t, subject())).data) as { slot: number }).slot;
    const user = people.get(slot)![0];

    await db.query(`update private.demo_slots set last_seen_at = now() - interval '10 minutes' where slot = $1`, [slot]);
    expect((await user.client.rpc("demo_lease_valid", { p_token_hash: hash(t) })).data).toBe(true);
    const { rows } = await db.query(`select last_seen_at > now() - interval '1 minute' as fresh from private.demo_slots where slot = $1`, [slot]);
    expect(rows[0].fresh).toBe(true); // touched

    await db.query(`update private.demo_slots set last_seen_at = now() - interval '31 minutes', updated_at = now() - interval '31 minutes' where slot = $1`, [slot]);
    expect((await user.client.rpc("demo_lease_valid", { p_token_hash: hash(t) })).data).toBe(false);

    // Occupy the other two slots, then the idle one is handed to a new visitor.
    const others = SLOTS.filter((s) => s !== slot);
    for (const o of others) await db.query(
      `update private.demo_slots set lease_token_hash = repeat('1', 64), leased_until = now() + interval '1 hour', last_seen_at = now() where slot = $1`, [o]);
    const t2 = tok();
    expect((await acquire(t2, subject())).data).toMatchObject({ ok: true, slot });
    expect((await adminClient().rpc("demo_check_lease", { p_slot: slot, p_token_hash: hash(t) })).data).toEqual({ valid: false });
  });

  it("hard expiry ends a lease even when active; renew extends only the holder's own lease", async () => {
    for (const slot of SLOTS) await db.query(`update private.demo_slots set lease_token_hash = null, leased_until = null where slot = $1`, [slot]);
    const t = tok();
    const slot = (((await acquire(t, subject())).data) as { slot: number }).slot;
    const admin = adminClient();
    expect((await admin.rpc("demo_renew_lease", { p_slot: slot, p_token_hash: hash(tok()), p_minutes: 30 })).data).toEqual({ valid: false });
    expect((await admin.rpc("demo_renew_lease", { p_slot: slot, p_token_hash: hash(t), p_minutes: 30 })).data).toMatchObject({ valid: true });
    await db.query(`update private.demo_slots set leased_until = now() - interval '1 second' where slot = $1`, [slot]);
    expect((await admin.rpc("demo_check_lease", { p_slot: slot, p_token_hash: hash(t) })).data).toEqual({ valid: false });
    expect((await admin.rpc("demo_renew_lease", { p_slot: slot, p_token_hash: hash(t), p_minutes: 30 })).data).toEqual({ valid: false });
  });

  it("rollback safety: a legacy demo_start_lease on a slot with stale activity is immediately valid", async () => {
    const slot = 19;
    const user = people.get(slot)![0];
    await db.query(`update private.demo_slots set last_seen_at = now() - interval '3 hours', updated_at = now() - interval '3 hours' where slot = $1`, [slot]);
    const t = tok();
    expect((await adminClient().rpc("demo_start_lease", { p_slot: slot, p_token_hash: hash(t), p_minutes: 30 })).error).toBeNull();
    expect((await adminClient().rpc("demo_check_lease", { p_slot: slot, p_token_hash: hash(t) })).data).toMatchObject({ valid: true });
    expect((await user.client.rpc("demo_lease_valid", { p_token_hash: hash(t) })).data).toBe(true);
    await adminClient().rpc("demo_end_lease", { p_slot: slot, p_token_hash: hash(t) });
  });

  it("validates input", async () => {
    const admin = adminClient();
    const bad = [
      { p_max_slot: 0, p_token_hash: hash("x"), p_minutes: 30, p_subject: subject(), p_max_per_subject: 2 },
      { p_max_slot: 21, p_token_hash: hash("x"), p_minutes: 30, p_subject: subject(), p_max_per_subject: 2 },
      { p_max_slot: MAX, p_token_hash: "nope", p_minutes: 30, p_subject: subject(), p_max_per_subject: 2 },
      { p_max_slot: MAX, p_token_hash: hash("x"), p_minutes: 1000, p_subject: subject(), p_max_per_subject: 2 },
      { p_max_slot: MAX, p_token_hash: hash("x"), p_minutes: 30, p_subject: "1.2.3.4", p_max_per_subject: 2 },
    ];
    for (const args of bad) expect((await admin.rpc("demo_acquire_slot", args)).error?.message).toMatch(/INVALID_INPUT/);
  });

  it("pool administration is not callable by anon or signed-in users", async () => {
    const user = people.get(17)![0];
    for (const client of [anonClient(), prodUser.client, user.client]) {
      const a = await client.rpc("demo_acquire_slot", { p_max_slot: MAX, p_token_hash: hash("x"), p_minutes: 30, p_subject: subject(), p_max_per_subject: 2 });
      expect(a.error?.code).toBe("42501");
      const r = await client.rpc("demo_renew_lease", { p_slot: 17, p_token_hash: hash("x"), p_minutes: 30 });
      expect(r.error?.code).toBe("42501");
    }
  });
});

describe("restart isolation", () => {
  it("restarting one sandbox leaves other sandboxes and production untouched", async () => {
    const before = { s18: await spaceCount(18), s19: await spaceCount(19) };
    const { rows: prodBefore } = await db.query(`select count(*)::int as n from public.matching_spaces where scope = 'prod'`);
    // Visitor in slot 17 creates data, visitor in slot 18 creates data.
    for (const slot of [17, 18]) {
      const { error } = await people.get(slot)![0].client.rpc("create_space", {
        p_payload: { type: "hackathon", title: `Visitor ${TAG} ${slot}`, edition_year: 2027, start_date: "2027-02-14", end_date: "2027-02-16", timezone: "America/Los_Angeles", format: "online" },
      });
      expect(error).toBeNull();
    }
    expect(await spaceCount(18)).toBe(before.s18 + 1);

    const { error } = await adminClient().rpc("demo_reset_slot", { p_slot: 17, p_fixture: fixture(17) });
    expect(error).toBeNull();
    expect(await spaceCount(17)).toBe(1); // back to the fixture
    expect(await spaceCount(18)).toBe(before.s18 + 1); // the other visitor's Space survives
    expect(await spaceCount(19)).toBe(before.s19);
    const { rows: prodAfter } = await db.query(`select count(*)::int as n from public.matching_spaces where scope = 'prod'`);
    expect(prodAfter[0].n).toBe(prodBefore[0].n);

    // A visitor can never see another sandbox's Spaces.
    const { data } = await people.get(17)![0].client.rpc("search_spaces", { p_query: `Visitor ${TAG}` });
    expect(data ?? []).toHaveLength(0);
  });
});

describe("demo Gemini budget", () => {
  it("production users are never limited and nothing is recorded", async () => {
    for (let i = 0; i < 6; i++) expect((await prodUser.client.rpc("demo_ai_quota_take")).data).toBe(true);
    const { rows } = await db.query(`select count(*)::int as n from private.api_events where subject = $1`, [prodUser.id]);
    expect(rows[0].n).toBe(0);
  });

  it("allows 4 Gemini kickoffs per visitor lease per hour, independently per sandbox", async () => {
    const a = people.get(17)![1];
    const b = people.get(18)![1];
    const takes: boolean[] = [];
    for (let i = 0; i < 5; i++) takes.push((await a.client.rpc("demo_ai_quota_take")).data as boolean);
    expect(takes).toEqual([true, true, true, true, false]);
    // Restarting the sandbox does not refill the budget.
    await adminClient().rpc("demo_reset_slot", { p_slot: 17, p_fixture: fixture(17) });
    expect((await people.get(17)![0].client.rpc("demo_ai_quota_take")).data).toBe(false);
    // Another visitor's sandbox has its own budget.
    expect((await b.client.rpc("demo_ai_quota_take")).data).toBe(true);
    // A NEW visitor who later receives the same slot (new lease epoch) gets a fresh budget.
    for (const slot of SLOTS) await db.query(`update private.demo_slots set lease_token_hash = null, leased_until = null where slot = $1`, [slot]);
    for (const o of [18, 19]) await db.query(
      `update private.demo_slots set lease_token_hash = repeat('1', 64), leased_until = now() + interval '1 hour', last_seen_at = now() where slot = $1`, [o]);
    expect((await acquire(tok(), subject())).data).toMatchObject({ ok: true, slot: 17 });
    expect((await a.client.rpc("demo_ai_quota_take")).data).toBe(true);
  });

  it("caps Gemini use across ALL sandboxes per day", async () => {
    await db.query(
      `insert into private.api_events (subject, kind) select 'demo:16#test', 'demo_ai_kickoff' from generate_series(1, 60)`);
    expect((await people.get(19)![0].client.rpc("demo_ai_quota_take")).data).toBe(false);
    expect((await prodUser.client.rpc("demo_ai_quota_take")).data).toBe(true);
  });

  it("anon cannot call it", async () => {
    expect((await anonClient().rpc("demo_ai_quota_take")).error?.code).toBe("42501");
  });
});
