/**
 * P3 demo sandbox RPCs. Uses an isolated TEST slot (9) with its own synthetic
 * personas so the presenter slot (0) is never disturbed by tests.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { adminClient, anonClient, createTestUser, dbClient, deleteTestUsers, type TestUser } from "./helpers";

const SLOT = 9;
const SCOPE = `demo:${SLOT}`;
const TAG = Array.from(randomBytes(4), (b) => String.fromCharCode(97 + (b % 26))).join("");

let db: pg.Client;
let personas: TestUser[] = [];
let presenter: TestUser; // synthetic persona in slot 9
let prodUser: TestUser;
let prodSpaceId: string;
let otherSlotSpaceId: string;

const keys = ["jordan", "maya", "priya", "alex", "p5", "p6"];
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

function fixture() {
  return {
    personas: keys.map((k, i) => ({
      key: k, display_name: `Synthetic ${k}`, university: "USC", bio: "Synthetic demo persona.",
      skills: ["python"], roles: i % 2 ? ["frontend"] : ["backend"], interests: ["education"], experience: "intermediate",
      working_style: { sync: "mixed" }, availability: [20, 21, 22], timezone: "America/Los_Angeles",
      hackathon_goal: "build", course_goal: "aim_a", sim_rank: i + 1,
    })),
    spaces: [
      {
        key: "hack", type: "hackathon", title: `DemoFest ${TAG} 2026`, visibility: "public", creator: "maya",
        min_team_size: 2, max_team_size: 4, team_size_source: "app_default",
        hackathon: { edition_year: 2026, organizer: "Test", official_url: null, start_date: "2026-11-14", end_date: "2026-11-15", timezone: "America/Los_Angeles", format: "in_person", location: "LA", rules_url: null },
        course: null,
      },
      {
        key: "course", type: "course", title: null, visibility: "unlisted", creator: "maya",
        min_team_size: 3, max_team_size: 4, team_size_source: "creator_stated", hackathon: null,
        course: { university: "USC", term: "Fall 2026", course_code: `CS ${TAG}`, course_title: null, allowed_sections: ["1"], assignment_name: "Project", assignment_key: null, instructions_url: null },
      },
    ],
    participations: [
      { space: "hack", persona: "jordan", goal: "build", desired_roles: ["backend"], topics: ["education"], looking_for_team: true, accept_invites: true, smart_match_opt_in: true, visible_to_members: true, notes: null },
      { space: "hack", persona: "maya", goal: "competitive", desired_roles: ["design"], topics: [], looking_for_team: true, accept_invites: true, smart_match_opt_in: true, visible_to_members: true, notes: null },
      { space: "course", persona: "jordan", goal: "aim_a", desired_roles: [], topics: [], looking_for_team: false, accept_invites: false, smart_match_opt_in: false, visible_to_members: false, notes: null },
    ],
  };
}

async function snapshotProd() {
  const { rows } = await db.query(`
    select
      (select count(*) from public.matching_spaces where scope = 'prod')::int as spaces,
      (select count(*) from public.participations pa join public.matching_spaces s on s.id = pa.space_id where s.scope = 'prod')::int as parts,
      (select md5(string_agg(id::text || display_name || coalesce(university, '') || array_to_string(skills, ','), '|' order by id)) from public.profiles where scope = 'prod') as profiles_digest,
      (select count(*) from public.matching_spaces where scope = 'demo:3')::int as other_slot`);
  return rows[0];
}

beforeAll(async () => {
  db = await dbClient();
  personas = await Promise.all(
    keys.map((k) => createTestUser({ displayName: `Synthetic ${k}`, appMetadata: { scope: SCOPE, is_synthetic: true } })),
  );
  presenter = personas[0];
  prodUser = await createTestUser({ displayName: "Real Student" });

  const admin = adminClient();
  const { error } = await admin.rpc("demo_register_personas", {
    p_slot: SLOT,
    p_personas: personas.map((u, i) => ({ persona_key: keys[i], user_id: u.id, switchable: i < 4 })),
  });
  expect(error).toBeNull();

  // A real production Space with a real participant, and a Space in ANOTHER demo slot.
  const { data: prod } = await prodUser.client.rpc("create_space", {
    p_payload: { type: "hackathon", title: `ProdHack ${TAG}`, edition_year: 2027, start_date: "2027-01-01", end_date: "2027-01-02", timezone: "America/Los_Angeles", format: "online" },
  });
  prodSpaceId = (prod as { space_id: string }).space_id;
  otherSlotSpaceId = crypto.randomUUID();
  await db.query(
    `insert into public.matching_spaces (id, scope, type, title, title_normalized, slug, identity_key, visibility, join_policy)
     values ($1, 'demo:3', 'hackathon', 'Other slot', 'other slot', $2, $3, 'public', 'open')`,
    [otherSlotSpaceId, `other-slot-${TAG}`, `h|otherslot${TAG}|2026`],
  );
});

afterAll(async () => {
  await db.query(`delete from public.matching_spaces where scope = $1 or id = any($2)`, [SCOPE, [prodSpaceId, otherSlotSpaceId]]);
  await db.query(`delete from private.demo_slots where slot = $1`, [SLOT]);
  await deleteTestUsers([...personas, prodUser]);
  await db?.end();
});

describe("demo administration is service-role only", () => {
  it("anon and authenticated users (including synthetic personas) cannot call admin RPCs", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["demo_reset_slot", { p_slot: SLOT, p_fixture: fixture() }],
      ["demo_simulate_joins", { p_slot: SLOT, p_space_id: prodSpaceId, p_count: 1 }],
      ["demo_start_lease", { p_slot: SLOT, p_token_hash: hash("x"), p_minutes: 30 }],
      ["demo_check_lease", { p_slot: SLOT, p_token_hash: hash("x") }],
      ["demo_register_personas", { p_slot: SLOT, p_personas: [] }],
      ["demo_rate_record", { p_subject: "x", p_kind: "y" }],
    ];
    for (const client of [anonClient(), prodUser.client, presenter.client]) {
      for (const [fn, args] of calls) {
        const { error } = await client.rpc(fn as never, args as never);
        expect(error?.code, fn).toBe("42501");
      }
    }
  });

  it("rejects invalid slots (the scope can never become 'prod')", async () => {
    for (const slot of [-1, 21, null]) {
      const { error } = await adminClient().rpc("demo_reset_slot", { p_slot: slot as never, p_fixture: fixture() });
      expect(error?.message, String(slot)).toMatch(/INVALID_INPUT/);
    }
  });

  it("refuses to register a non-synthetic or out-of-scope profile as a persona", async () => {
    const { error } = await adminClient().rpc("demo_register_personas", {
      p_slot: SLOT, p_personas: [{ persona_key: "intruder", user_id: prodUser.id, switchable: false }],
    });
    expect(error?.message).toMatch(/DEMO_SCOPE_VIOLATION/);
  });
});

describe("reset", () => {
  let spaces: Record<string, { id: string; slug: string }>;

  it("loads the fixture into the demo scope only, leaving production and other slots unchanged", async () => {
    const before = await snapshotProd();
    const { data, error } = await adminClient().rpc("demo_reset_slot", { p_slot: SLOT, p_fixture: fixture() });
    expect(error).toBeNull();
    const r = data as { scope: string; personas: number; participations: number; spaces: typeof spaces };
    expect(r).toMatchObject({ scope: SCOPE, personas: keys.length, participations: 3 });
    spaces = r.spaces;
    expect(await snapshotProd()).toEqual(before);

    const { rows } = await db.query(`select scope::text, count(*)::int n from public.matching_spaces where id = any($1) group by 1`, [
      [spaces.hack.id, spaces.course.id],
    ]);
    expect(rows).toEqual([{ scope: SCOPE, n: 2 }]);
    const { rows: src } = await db.query(`select distinct source from public.participations where space_id = $1`, [spaces.hack.id]);
    expect(src.map((x) => x.source)).toEqual(["seed"]);
  });

  it("labels personas as synthetic and keeps the creator without privileges (no teams)", async () => {
    const { rows } = await db.query(`select bool_and(is_synthetic) all_synth, count(*)::int n from public.profiles where id = any($1)`, [
      personas.map((p) => p.id),
    ]);
    expect(rows[0]).toEqual({ all_synth: true, n: keys.length });
    const { rows: t } = await db.query(`select count(*)::int n from public.teams where space_id = $1`, [spaces.hack.id]);
    expect(t[0].n).toBe(0);
  });

  it("is isolated: prod users cannot see demo Spaces; demo users cannot see prod Spaces", async () => {
    const prodView = await prodUser.client.rpc("search_spaces", { p_query: `DemoFest ${TAG}` });
    expect((prodView.data ?? []).length).toBe(0);
    const demoView = await presenter.client.rpc("search_spaces", { p_query: `ProdHack ${TAG}` });
    expect((demoView.data ?? []).length).toBe(0);
    const demoOwn = await presenter.client.rpc("search_spaces", { p_query: `DemoFest ${TAG}` });
    expect((demoOwn.data ?? []).map((s) => s.id)).toEqual([spaces.hack.id]);
  });

  it("removes Spaces created during the demo and restores edited profiles", async () => {
    const created = await presenter.client.rpc("create_space", {
      p_payload: { type: "hackathon", title: `LiveHack ${TAG}`, edition_year: 2027, start_date: "2027-02-14", end_date: "2027-02-16", timezone: "America/Los_Angeles", format: "in_person" },
    });
    expect(created.error).toBeNull();
    const liveId = (created.data as { space_id: string }).space_id;
    await presenter.client.from("profiles").update({ display_name: "Edited during demo" }).eq("id", presenter.id);

    const before = await snapshotProd();
    const { data, error } = await adminClient().rpc("demo_reset_slot", { p_slot: SLOT, p_fixture: fixture() });
    expect(error).toBeNull();
    spaces = (data as { spaces: typeof spaces }).spaces;
    expect(await snapshotProd()).toEqual(before);

    const { rows } = await db.query(`select count(*)::int n from public.matching_spaces where id = $1`, [liveId]);
    expect(rows[0].n).toBe(0);
    const { rows: p } = await db.query(`select display_name from public.profiles where id = $1`, [presenter.id]);
    expect(p[0].display_name).toBe("Synthetic jordan");
  });
});

describe("simulated joins use the normal join rules", () => {
  let live: { space_id: string; slug: string };

  beforeAll(async () => {
    await adminClient().rpc("demo_reset_slot", { p_slot: SLOT, p_fixture: fixture() });
    const { data } = await presenter.client.rpc("create_space", {
      p_payload: { type: "hackathon", title: `SimHack ${TAG}`, edition_year: 2027, start_date: "2027-02-14", end_date: "2027-02-16", timezone: "America/Los_Angeles", format: "in_person" },
    });
    live = data as typeof live;
  });

  it("joins synthetic personas in priority order and labels them simulated + opted-in", async () => {
    const { data, error } = await adminClient().rpc("demo_simulate_joins", { p_slot: SLOT, p_space_id: live.space_id, p_count: 3 });
    expect(error).toBeNull();
    expect(data).toEqual({ joined: 3, participant_count: 4 });
    const { rows } = await db.query(
      `select pa.source, pa.smart_match_opt_in, pa.visible_to_members, pa.accept_invites, pr.scope::text, pr.is_synthetic
       from public.participations pa join public.profiles pr on pr.id = pa.user_id
       where pa.space_id = $1 and pa.user_id <> $2`,
      [live.space_id, presenter.id],
    );
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r).toEqual({ source: "simulated", smart_match_opt_in: true, visible_to_members: true, accept_invites: true, scope: SCOPE, is_synthetic: true });
    }
    // Priority: maya, priya, alex arrive first.
    const { rows: who } = await db.query(
      `select dp.persona_key from public.participations pa join private.demo_personas dp on dp.user_id = pa.user_id
       where pa.space_id = $1 and pa.source = 'simulated' order by 1`,
      [live.space_id],
    );
    expect(who.map((w) => w.persona_key)).toEqual(["alex", "maya", "priya"]);
  });

  it("never adds duplicates and stops when the pool is exhausted", async () => {
    const { data } = await adminClient().rpc("demo_simulate_joins", { p_slot: SLOT, p_space_id: live.space_id, p_count: 40 });
    expect(data).toEqual({ joined: 2, participant_count: keys.length });
    const { rows } = await db.query(`select count(*)::int n, count(distinct user_id)::int d from public.participations where space_id = $1`, [live.space_id]);
    expect(rows[0].n).toBe(rows[0].d);
  });

  it("joins invite-only Spaces with the Space's own code", async () => {
    const { data } = await adminClient().rpc("demo_simulate_joins", { p_slot: SLOT, p_space_id: (await courseId()), p_count: 2 });
    expect((data as { joined: number }).joined).toBe(2);
  });

  it("refuses production Spaces, other demo slots, and closed Spaces", async () => {
    const before = await snapshotProd();
    for (const id of [prodSpaceId, otherSlotSpaceId]) {
      const { error } = await adminClient().rpc("demo_simulate_joins", { p_slot: SLOT, p_space_id: id, p_count: 5 });
      expect(error?.message, id).toMatch(/^NOT_FOUND/);
    }
    expect(await snapshotProd()).toEqual(before);

    await db.query(`update public.matching_spaces set status = 'closed' where id = $1`, [live.space_id]);
    await db.query(`delete from public.participations where space_id = $1 and source = 'simulated'`, [live.space_id]);
    const { error } = await adminClient().rpc("demo_simulate_joins", { p_slot: SLOT, p_space_id: live.space_id, p_count: 1 });
    expect(error?.message).toMatch(/^SPACE_CLOSED/);
  });

  async function courseId() {
    const { rows } = await db.query(`select id from public.matching_spaces where scope = $1 and type = 'course'`, [SCOPE]);
    return rows[0].id as string;
  }
});

describe("leases", () => {
  const token = randomBytes(32).toString("base64url");

  it("validates only the current, unexpired token for the caller's own slot", async () => {
    const admin = adminClient();
    const { error } = await admin.rpc("demo_start_lease", { p_slot: SLOT, p_token_hash: hash(token), p_minutes: 30 });
    expect(error).toBeNull();

    expect((await admin.rpc("demo_check_lease", { p_slot: SLOT, p_token_hash: hash(token) })).data).toMatchObject({ valid: true });
    expect((await admin.rpc("demo_check_lease", { p_slot: SLOT, p_token_hash: hash("wrong") })).data).toEqual({ valid: false });

    expect((await presenter.client.rpc("demo_lease_valid", { p_token_hash: hash(token) })).data).toBe(true);
    expect((await presenter.client.rpc("demo_lease_valid", { p_token_hash: hash("wrong") })).data).toBe(false);
    // A production user holding the token still gets false (not a demo scope).
    expect((await prodUser.client.rpc("demo_lease_valid", { p_token_hash: hash(token) })).data).toBe(false);
    expect((await anonClient().rpc("demo_lease_valid", { p_token_hash: hash(token) })).error?.code).toBe("42501");
  });

  it("a new start replaces the old lease (old token becomes invalid)", async () => {
    const admin = adminClient();
    const next = randomBytes(32).toString("base64url");
    await admin.rpc("demo_start_lease", { p_slot: SLOT, p_token_hash: hash(next), p_minutes: 30 });
    expect((await presenter.client.rpc("demo_lease_valid", { p_token_hash: hash(token) })).data).toBe(false);
    expect((await presenter.client.rpc("demo_lease_valid", { p_token_hash: hash(next) })).data).toBe(true);
  });

  it("expired leases are invalid; ending a lease clears it", async () => {
    const admin = adminClient();
    const t = randomBytes(32).toString("base64url");
    await admin.rpc("demo_start_lease", { p_slot: SLOT, p_token_hash: hash(t), p_minutes: 30 });
    await db.query(`update private.demo_slots set leased_until = now() - interval '1 second' where slot = $1`, [SLOT]);
    expect((await presenter.client.rpc("demo_lease_valid", { p_token_hash: hash(t) })).data).toBe(false);

    const t2 = randomBytes(32).toString("base64url");
    await admin.rpc("demo_start_lease", { p_slot: SLOT, p_token_hash: hash(t2), p_minutes: 30 });
    expect((await admin.rpc("demo_end_lease", { p_slot: SLOT, p_token_hash: hash(t2) })).data).toBe(true);
    expect((await presenter.client.rpc("demo_lease_valid", { p_token_hash: hash(t2) })).data).toBe(false);
  });

  it("validates lease input", async () => {
    const admin = adminClient();
    expect((await admin.rpc("demo_start_lease", { p_slot: SLOT, p_token_hash: "not-a-hash", p_minutes: 30 })).error?.message).toMatch(/INVALID_INPUT/);
    expect((await admin.rpc("demo_start_lease", { p_slot: SLOT, p_token_hash: hash("x"), p_minutes: 10_000 })).error?.message).toMatch(/INVALID_INPUT/);
  });
});

describe("user-facing labels", () => {
  it("participation source is not user-editable", async () => {
    const { error } = await presenter.client.from("participations").update({ source: "self" } as never).eq("user_id", presenter.id);
    expect(error?.code).toBe("42501");
  });
});

describe("demo reset clears Space-creation limits for this sandbox's synthetic personas only", () => {
  let otherSlotPersona: TestUser;
  const hackPayload = (title: string) => ({
    type: "hackathon", title, edition_year: 2027, start_date: "2027-02-14", end_date: "2027-02-16",
    timezone: "America/Los_Angeles", format: "in_person",
  });
  const events = async (subject: string, kind: string) =>
    (await db.query(`select count(*)::int n from private.api_events where subject = $1 and kind = $2`, [subject, kind])).rows[0].n as number;
  const prodLimitDigest = async () =>
    (await db.query(
      `select count(*)::int n, md5(coalesce(string_agg(subject || kind || created_at::text, '|' order by id), '')) d
       from private.api_events where subject = $1`,
      [prodUser.id],
    )).rows[0];

  beforeAll(async () => {
    otherSlotPersona = await createTestUser({ displayName: "Synthetic other slot", appMetadata: { scope: "demo:3", is_synthetic: true } });
    const { error } = await adminClient().rpc("demo_register_personas", {
      p_slot: 3, p_personas: [{ persona_key: `other_${TAG}`, user_id: otherSlotPersona.id, switchable: false }],
    });
    expect(error).toBeNull();
    await adminClient().rpc("demo_reset_slot", { p_slot: SLOT, p_fixture: fixture() });
    await db.query(`delete from private.api_events where subject = $1`, [presenter.id]);
  });

  afterAll(async () => {
    await db.query(`delete from private.api_events where subject = any($1)`, [[presenter.id, prodUser.id, otherSlotPersona.id]]);
    await db.query(`delete from private.demo_personas where slot = 3 and user_id = $1`, [otherSlotPersona.id]);
    await deleteTestUsers([otherSlotPersona]);
  });

  it("is service-role only", async () => {
    for (const client of [anonClient(), prodUser.client, presenter.client]) {
      const { error } = await client.rpc("demo_clear_create_limits" as never, { p_slot: SLOT } as never);
      expect(error?.code).toBe("42501");
    }
    const { error } = await adminClient().rpc("demo_clear_create_limits", { p_slot: -1 });
    expect(error?.message).toMatch(/INVALID_INPUT/);
  });

  it("clears only this slot's synthetic create_space events", async () => {
    const seed = async (subject: string, kind: string, n: number) => {
      for (let i = 0; i < n; i++) await db.query(`insert into private.api_events (subject, kind) values ($1, $2)`, [subject, kind]);
    };
    await seed(presenter.id, "create_space", 3);
    await seed(presenter.id, "join_code_failed", 2);
    await seed(prodUser.id, "create_space", 3);
    await seed(otherSlotPersona.id, "create_space", 2);
    const prodBefore = await prodLimitDigest();

    const { data, error } = await adminClient().rpc("demo_clear_create_limits", { p_slot: SLOT });
    expect(error).toBeNull();
    expect(data).toBe(3);

    expect(await events(presenter.id, "create_space")).toBe(0);
    expect(await events(presenter.id, "join_code_failed")).toBe(2); // other limit kinds are kept
    expect(await events(otherSlotPersona.id, "create_space")).toBe(2); // other sandboxes untouched
    expect(await prodLimitDigest()).toEqual(prodBefore); // production limits untouched
  });

  it("normal rate limiting still applies without a reset", async () => {
    await adminClient().rpc("demo_clear_create_limits", { p_slot: SLOT });
    for (let i = 0; i < 10; i++) {
      const { error } = await presenter.client.rpc("create_space", { p_payload: hackPayload(`Limit ${TAG} ${String.fromCharCode(97 + i)}`) });
      expect(error, `create #${i + 1}`).toBeNull();
    }
    const blocked = await presenter.client.rpc("create_space", { p_payload: hackPayload(`Limit ${TAG} k`) });
    expect(blocked.error?.message).toMatch(/^RATE_LIMITED/);
  });

  it("survives 12 consecutive create → reset → clear cycles (production unchanged)", async () => {
    const before = await snapshotProd();
    const prodLimitsBefore = await prodLimitDigest();
    for (let i = 0; i < 12; i++) {
      await adminClient().rpc("demo_reset_slot", { p_slot: SLOT, p_fixture: fixture() });
      await adminClient().rpc("demo_clear_create_limits", { p_slot: SLOT });
      const { error } = await presenter.client.rpc("create_space", { p_payload: hackPayload(`TreeHacks ${TAG}`) });
      expect(error, `cycle ${i + 1}`).toBeNull();
    }
    expect(await snapshotProd()).toEqual(before);
    expect(await prodLimitDigest()).toEqual(prodLimitsBefore);
  });
});
