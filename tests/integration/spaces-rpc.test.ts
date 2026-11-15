/**
 * P2 Matching Space RPCs, called DIRECTLY through PostgREST as real users
 * (anon key + JWT), never through Next.js routes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { anonClient, createTestUser, dbClient, deleteTestUsers, type TestUser } from "./helpers";

// Letters only, so it never looks like an edition year.
const TAG = Array.from(randomBytes(5), (b) => String.fromCharCode(97 + (b % 26))).join("");
const URL_BASE = `https://${TAG}.hack.example.com`;

type Payload = Record<string, unknown>;
const hackathon = (over: Payload = {}): Payload => ({
  type: "hackathon",
  title: `TreeHacks ${TAG}`,
  edition_year: 2027,
  start_date: "2027-02-14",
  end_date: "2027-02-16",
  timezone: "America/Los_Angeles",
  format: "in_person",
  location: "Stanford, CA",
  official_url: `${URL_BASE}/`,
  ...over,
});
const course = (over: Payload = {}): Payload => ({
  type: "course",
  university: "USC",
  term: "Fall 2026",
  course_code: `CS${TAG}`.slice(0, 12),
  assignment_name: "Final Group Project",
  allowed_sections: ["Section 1"],
  min_team_size: 3,
  max_team_size: 4,
  instructions_url: "https://canvas.example.edu/courses/1/assignments/9",
  ...over,
});

let db: pg.Client;
let alice: TestUser; // creator
let bob: TestUser;   // second student
let carol: TestUser; // outsider
let demo: TestUser;  // synthetic, demo scope

async function rpc<T = unknown>(u: TestUser | null, fn: string, args: Record<string, unknown>) {
  const client = u ? u.client : anonClient();
  return (await client.rpc(fn as never, args as never)) as { data: T; error: { code?: string; message: string } | null };
}
async function create(u: TestUser, payload: Payload) {
  return rpc<{ space_id: string; slug: string; join_code: string | null }>(u, "create_space", { p_payload: payload });
}

beforeAll(async () => {
  db = await dbClient();
  [alice, bob, carol, demo] = await Promise.all([
    createTestUser({ displayName: "Alice Creator" }),
    createTestUser({ displayName: "Bob Joiner" }),
    createTestUser({ displayName: "Carol Outsider" }),
    createTestUser({ displayName: "Demo Dana", appMetadata: { scope: "demo:0", is_synthetic: true } }),
  ]);
});

afterAll(async () => {
  const ids = [alice, bob, carol, demo].filter(Boolean).map((u) => u.id);
  await db.query(`delete from public.matching_spaces where created_by = any($1)`, [ids]);
  await db.query(`delete from private.api_events where subject = any($1)`, [ids]);
  await deleteTestUsers([alice, bob, carol, demo]);
  await db?.end();
});

describe("normalization helpers", () => {
  it("normalizes official URLs", async () => {
    const cases: [string, string | null][] = [
      ["https://www.TreeHacks.com/", "https://treehacks.com"],
      ["http://treehacks.com/?utm_source=x&utm_medium=y#top", "https://treehacks.com"],
      ["https://treehacks.com/apply?ref=abc&id=7", "https://treehacks.com/apply?id=7"],
      ["   ", null],
    ];
    for (const [input, expected] of cases) {
      const { rows } = await db.query(`select private.normalize_url($1) as v`, [input]);
      expect(rows[0].v, input).toBe(expected);
    }
  });

  it("builds hackathon and course identity keys", async () => {
    const { rows } = await db.query(`
      select private.hackathon_identity_key('TreeHacks 2027', 2027) a,
             private.hackathon_identity_key('Tree-Hacks', 2027) b,
             private.hackathon_identity_key('TreeHacks 2026', 2026) c,
             private.course_identity_key('USC', 'Fall 2026', 'CSCI 567', 'Final Project', array['Section 2', 'sec 1']) d,
             private.course_identity_key('usc', 'fall 2026', 'csci567', 'final project', array['1', '2']) e`);
    expect(rows[0].a).toBe(rows[0].b);
    expect(rows[0].a).not.toBe(rows[0].c);
    expect(rows[0].d).toBe(rows[0].e);
  });
});

describe("create_space", () => {
  let created: { space_id: string; slug: string };

  it("creates a hackathon Space, enrolls the creator, and creates NO team", async () => {
    const { data, error } = await create(alice, hackathon());
    expect(error).toBeNull();
    created = data;
    expect(data.slug).toMatch(/^treehacks-[a-z]+-2027-[a-z2-9]{8}$/);
    expect(data.join_code).toBeNull(); // public hackathon: open join

    const { rows: s } = await db.query(
      `select title, scope::text, visibility, join_policy, created_by, team_size_source from public.matching_spaces where id = $1`,
      [data.space_id],
    );
    expect(s[0]).toMatchObject({
      title: `TreeHacks ${TAG} 2027`, scope: "prod", visibility: "public", join_policy: "open",
      created_by: alice.id, team_size_source: "app_default",
    });

    const { rows: p } = await db.query(
      `select user_id, looking_for_team, accept_invites, smart_match_opt_in, visible_to_members, setup_completed
       from public.participations where space_id = $1`,
      [data.space_id],
    );
    expect(p).toEqual([{
      user_id: alice.id, looking_for_team: false, accept_invites: false,
      smart_match_opt_in: false, visible_to_members: false, setup_completed: false,
    }]);

    const { rows: t } = await db.query(`select count(*)::int n from public.teams where space_id = $1`, [data.space_id]);
    expect(t[0].n).toBe(0);
    const { rows: m } = await db.query(`select count(*)::int n from public.team_members where user_id = $1`, [alice.id]);
    expect(m[0].n).toBe(0);
  });

  it("keeps different edition years distinct (TreeHacks 2026 vs 2027)", async () => {
    const { data, error } = await create(alice, hackathon({ edition_year: 2026, start_date: "2026-02-14", end_date: "2026-02-16" }));
    expect(error).toBeNull();
    expect(data.space_id).not.toBe(created.space_id);

    // Search treats an explicit year as a hard filter; no year finds both editions.
    const ids = async (q: string) =>
      ((await rpc<Array<{ id: string }>>(null, "search_spaces", { p_type: "hackathon", p_query: q })).data ?? []).map((r) => r.id);
    expect(await ids(`TreeHacks ${TAG} 2027`)).toEqual([created.space_id]);
    expect(await ids(`TreeHacks ${TAG} 2026`)).toEqual([data.space_id]);
    expect((await ids(`TreeHacks ${TAG}`)).sort()).toEqual([created.space_id, data.space_id].sort());
  });

  it.each([
    ["spelling variant", { title: `Tree Hacks ${TAG}` }],
    ["year in the name", { title: `TreeHacks ${TAG} 2027` }],
    ["case/punctuation", { title: `TREEHACKS-${TAG.toUpperCase()}` }],
  ])("rejects an exact duplicate in the same scope (%s)", async (_label, over) => {
    const { error } = await create(bob, hackathon({ ...over, official_url: null }));
    expect(error?.message).toMatch(/^DUPLICATE_SPACE/);
  });

  it("rejects a different name with the same normalized official URL + year", async () => {
    const { error } = await create(bob, hackathon({
      title: `Stanford Hack Weekend ${TAG}`,
      official_url: `${URL_BASE.replace("https://", "http://www.")}/?utm_source=newsletter#faq`,
    }));
    expect(error?.message).toMatch(/^DUPLICATE_SPACE/);
  });

  it("lets only one of two concurrent identical creations succeed", async () => {
    const payload = hackathon({ title: `RaceHack ${TAG}`, official_url: null });
    const results = await Promise.all([create(alice, payload), create(bob, payload)]);
    const ok = results.filter((r) => !r.error);
    const dup = results.filter((r) => r.error?.message.startsWith("DUPLICATE_SPACE"));
    expect(ok).toHaveLength(1);
    expect(dup).toHaveLength(1);
  });

  it("validates input server-side", async () => {
    const bad: [string, Payload][] = [
      ["missing type", { title: "x" }],
      ["missing dates", hackathon({ title: `NoDates ${TAG}`, start_date: null })],
      ["end before start", hackathon({ title: `Backwards ${TAG}`, start_date: "2027-03-02", end_date: "2027-03-01" })],
      ["bad url", hackathon({ title: `BadUrl ${TAG}`, official_url: "javascript:alert(1)" })],
      ["unknown tz", hackathon({ title: `BadTz ${TAG}`, timezone: "Mars/Olympus" })],
      ["bad team size", hackathon({ title: `BadSize ${TAG}`, min_team_size: 5, max_team_size: 2 })],
      ["course without sections", course({ allowed_sections: [] })],
    ];
    for (const [label, payload] of bad) {
      const { error } = await create(carol, payload);
      expect(error?.message, label).toMatch(/^INVALID_INPUT/);
    }
  });

  it("is unavailable to anon", async () => {
    const { error } = await rpc(null, "create_space", { p_payload: hackathon({ title: `Anon ${TAG}` }) });
    expect(error?.code).toBe("42501");
  });
});

describe("course Spaces: unlisted + join code by default", () => {
  let space: { space_id: string; slug: string; join_code: string };

  beforeAll(async () => {
    const { data, error } = await create(alice, course());
    expect(error).toBeNull();
    space = data as typeof space;
  });

  it("defaults to unlisted with an 8-character code stored only in space_secrets", async () => {
    expect(space.join_code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const { rows } = await db.query(`select visibility, join_policy, team_size_source from public.matching_spaces where id = $1`, [space.space_id]);
    expect(rows[0]).toEqual({ visibility: "unlisted", join_policy: "code", team_size_source: "creator_stated" });
  });

  it("treats the same section set in any order/format as a duplicate", async () => {
    const { error } = await create(bob, course({ allowed_sections: ["sec 1"] }));
    expect(error?.message).toMatch(/^DUPLICATE_SPACE/);
  });

  it("keeps different terms and different assignments distinct", async () => {
    const t = await create(bob, course({ term: "Spring 2027" }));
    expect(t.error).toBeNull();
    const a = await create(bob, course({ assignment_name: "Homework 3 Pair Project" }));
    expect(a.error).toBeNull();
  });

  it("duplicate check reveals an unlisted match without its link", async () => {
    const { data, error } = await rpc<Array<Record<string, unknown>>>(carol, "check_space_duplicates", { p_payload: course() });
    expect(error).toBeNull();
    const exact = data.find((r) => r.match_kind === "exact");
    expect(exact).toMatchObject({ space_id: space.space_id, slug: null, requires_code: true, is_member: false });
  });

  it("does not appear in search for non-members, but does for its members", async () => {
    const q = String(course().course_code);
    for (const u of [null, carol]) {
      const { data } = await rpc<Array<{ id: string }>>(u, "search_spaces", { p_type: "course", p_query: q });
      expect((data ?? []).map((r) => r.id)).not.toContain(space.space_id);
    }
    const { data } = await rpc<Array<{ id: string; is_member: boolean }>>(alice, "search_spaces", { p_type: "course", p_query: q });
    expect(data.find((r) => r.id === space.space_id)?.is_member).toBe(true);
  });

  it("get_space: anon gets nothing; non-members get metadata without the private instructions link", async () => {
    expect((await rpc(null, "get_space", { p_slug: space.slug })).data).toBeNull();
    type Detail = { requires_code: boolean; is_member: boolean; participant_count: number; course: { instructions_url: string | null } };
    const outsider = await rpc<Detail>(carol, "get_space", { p_slug: space.slug });
    expect(outsider.data).toMatchObject({ requires_code: true, is_member: false, participant_count: 1 });
    expect(outsider.data.course.instructions_url).toBeNull();
    const member = await rpc<Detail>(alice, "get_space", { p_slug: space.slug });
    expect(member.data.course.instructions_url).toMatch(/^https:\/\/canvas/);
  });

  it("join requires the correct code (case/format-insensitive)", async () => {
    const none = await rpc<Record<string, unknown>>(bob, "join_space", { p_space_id: space.space_id });
    expect(none.data).toMatchObject({ ok: false, error: "INVALID_CODE" });
    const wrong = await rpc<Record<string, unknown>>(bob, "join_space", { p_space_id: space.space_id, p_code: "AAAAAAAA" });
    expect(wrong.data).toMatchObject({ ok: false, error: "INVALID_CODE" });
    const formatted = `${space.join_code.slice(0, 4).toLowerCase()}-${space.join_code.slice(4)}`;
    const ok = await rpc<Record<string, unknown>>(bob, "join_space", { p_space_id: space.space_id, p_code: formatted });
    expect(ok.data).toMatchObject({ ok: true, already_member: false, slug: space.slug });
    const { rows } = await db.query(`select count(*)::int n from public.participations where space_id = $1`, [space.space_id]);
    expect(rows[0].n).toBe(2);
  });

  it("rate-limits repeated wrong codes", async () => {
    const guesser = await createTestUser({ displayName: "Guesser" });
    try {
      for (let i = 0; i < 10; i++) {
        await rpc(guesser, "join_space", { p_space_id: space.space_id, p_code: `WRONG${i}` });
      }
      const blocked = await rpc<Record<string, unknown>>(guesser, "join_space", { p_space_id: space.space_id, p_code: space.join_code });
      expect(blocked.data).toMatchObject({ ok: false, error: "RATE_LIMITED" });
    } finally {
      await db.query(`delete from private.api_events where subject = $1`, [guesser.id]);
      await deleteTestUsers([guesser]);
    }
  });

  it("only participants (any participant, not just the creator) can get the invite code", async () => {
    const asBob = await rpc<{ slug: string; join_code: string }>(bob, "get_invite_link", { p_space_id: space.space_id });
    expect(asBob.data).toEqual({ slug: space.slug, join_code: space.join_code });
    const asCarol = await rpc(carol, "get_invite_link", { p_space_id: space.space_id });
    expect(asCarol.error?.message).toMatch(/^NOT_PARTICIPANT/);
    const asAnon = await rpc(null, "get_invite_link", { p_space_id: space.space_id });
    expect(asAnon.error?.code).toBe("42501");
  });
});

describe("joining public Spaces", () => {
  let space: { space_id: string; slug: string };

  beforeAll(async () => {
    const { data, error } = await create(alice, hackathon({ title: `JoinFest ${TAG}`, official_url: null }));
    expect(error).toBeNull();
    space = data;
  });

  it("is open, idempotent, and counts are real", async () => {
    const first = await rpc<Record<string, unknown>>(bob, "join_space", { p_space_id: space.space_id });
    expect(first.data).toMatchObject({ ok: true, already_member: false });
    const again = await rpc<Record<string, unknown>>(bob, "join_space", { p_space_id: space.space_id });
    expect(again.data).toMatchObject({ ok: true, already_member: true });

    const { data } = await rpc<Array<{ id: string; participant_count: number }>>(null, "search_spaces", {
      p_type: "hackathon", p_query: `JoinFest ${TAG}`,
    });
    expect(data.find((r) => r.id === space.space_id)?.participant_count).toBe(2);
  });

  it("refuses closed Spaces", async () => {
    const { data: closed } = await create(alice, hackathon({ title: `ClosedCon ${TAG}`, official_url: null }));
    await db.query(`update public.matching_spaces set status = 'closed' where id = $1`, [closed.space_id]);
    const { error } = await rpc(carol, "join_space", { p_space_id: closed.space_id });
    expect(error?.message).toMatch(/^SPACE_CLOSED/);
  });

  it("isolates scopes: demo users cannot see or join prod Spaces", async () => {
    const seen = await rpc<Array<{ id: string }>>(demo, "search_spaces", { p_query: `JoinFest ${TAG}` });
    expect((seen.data ?? []).map((r) => r.id)).not.toContain(space.space_id);
    expect((await rpc(demo, "get_space", { p_slug: space.slug })).data).toBeNull();
    const { error } = await rpc(demo, "join_space", { p_space_id: space.space_id });
    expect(error?.message).toMatch(/^NOT_FOUND/);
  });
});

describe("Space creators get no special privileges; participation is per Space", () => {
  let s1: string;
  let s2: string;

  beforeAll(async () => {
    s1 = (await create(alice, hackathon({ title: `PrivacyHack ${TAG}`, official_url: null }))).data.space_id;
    s2 = (await create(carol, hackathon({ title: `OtherHack ${TAG}`, official_url: null }))).data.space_id;
    await rpc(bob, "join_space", { p_space_id: s1 });
    await rpc(bob, "join_space", { p_space_id: s2 });
  });

  it("the creator cannot see a member who has not opted into visibility", async () => {
    const hidden = await alice.client.from("participations").select("user_id").eq("space_id", s1).eq("user_id", bob.id);
    expect(hidden.data).toEqual([]);
    const profile = await alice.client.from("profiles").select("id").eq("id", bob.id);
    expect(profile.data).toEqual([]);

    await bob.client.from("participations").update({ visible_to_members: true }).eq("space_id", s1);
    const visible = await alice.client.from("participations").select("user_id").eq("space_id", s1).eq("user_id", bob.id);
    expect(visible.data).toHaveLength(1);
  });

  it("the creator cannot read join codes or edit others' participation", async () => {
    expect((await alice.client.from("space_secrets").select("*")).error?.code).toBe("42501");
    const edit = await alice.client.from("participations").update({ notes: "hijack" }).eq("user_id", bob.id).select("id");
    expect(edit.data ?? []).toEqual([]);
  });

  it("updating preferences in one Space does not change another", async () => {
    const u = await bob.client
      .from("participations")
      .update({ goal: "competitive", desired_roles: ["frontend"], smart_match_opt_in: true })
      .eq("space_id", s1)
      .select("space_id");
    expect(u.error).toBeNull();
    expect(u.data).toHaveLength(1);
    const { rows } = await db.query(
      `select space_id, goal, desired_roles, smart_match_opt_in from public.participations where user_id = $1 and space_id = any($2)`,
      [bob.id, [s1, s2]],
    );
    const bySpace = Object.fromEntries(rows.map((r) => [r.space_id, r]));
    expect(bySpace[s1]).toMatchObject({ goal: "competitive", desired_roles: ["frontend"], smart_match_opt_in: true });
    expect(bySpace[s2]).toMatchObject({ goal: null, desired_roles: [], smart_match_opt_in: false });
  });

  it("a participation cannot be moved to another Space", async () => {
    const { error } = await bob.client.from("participations").update({ space_id: s2 } as never).eq("space_id", s1);
    expect(error?.code).toBe("42501");
  });

  it("a member of one Space cannot see participants of an unrelated Space", async () => {
    // Bob is visible in s1 only; Carol (s2 creator) shares s2 with Bob but Bob is hidden there.
    const fromCarol = await carol.client.from("participations").select("space_id").eq("user_id", bob.id);
    expect(fromCarol.data ?? []).toEqual([]);
  });
});
