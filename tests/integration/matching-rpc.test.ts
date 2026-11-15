/**
 * P4-B hard constraints. get_match_pool is called DIRECTLY through PostgREST as
 * real users, and the matching service runs on top of the real pool.
 *
 * Covers: B (hard constraints), C (consent), D (cross-Space), E (demo/prod),
 * F (accepted memberships), G (capacity), L (unauthorized access), M (read-only),
 * N (demo reset restores matching state).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import { ApiError } from "@/lib/api/errors";
import { formProposal, loadPool, matchParamsSchema, recommendMembers, replaceCandidate, replaceParamsSchema } from "@/lib/matching/service";
import { adminClient, anonClient, createTestUser, dbClient, deleteTestUsers, type TestUser } from "./helpers";

const TAG = Array.from(randomBytes(5), (b) => String.fromCharCode(97 + (b % 26))).join("");
const HOURS = [20, 21, 22, 23, 44, 45, 46, 47];

let db: pg.Client;
let me: TestUser;       // creates the Space, forms a team from scratch
let recruiter: TestUser; // owns a team in the Space
let plain: TestUser;     // accepted member of that team WITHOUT recruiting rights
let outsider: TestUser;  // signed in, not in the Space
let demoUser: TestUser;  // synthetic, demo scope
const silent: Record<string, string> = {}; // users who never sign in: name → id
let spaceId: string;
let otherSpaceId: string;
let teamId: string;

type Raw = { candidates: { id: string }[]; funnel: Record<string, number>; team: null | { members: { id: string }[]; pending_invites: number } };
const pool = async (u: TestUser | null, space: string, team?: string) =>
  ((u ? u.client : anonClient()).rpc("get_match_pool", { p_space_id: space, p_team_id: team }) as unknown) as Promise<{
    data: Raw;
    error: { code?: string; message: string } | null;
  }>;
const ids = (r: Raw) => r.candidates.map((c) => c.id).sort();
const P = (o: Record<string, unknown> = {}) => matchParamsSchema.parse(o);

async function silentUser(name: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email: `it-${randomUUID().slice(0, 12)}@trojanmatch.test`, password: "Test-Password-1234!", email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (error) throw error;
  silent[name] = data.user.id;
  return data.user.id;
}

async function join(space: string, userId: string, consent: Partial<Record<"visible_to_members" | "accept_invites" | "smart_match_opt_in" | "looking_for_team", boolean>> = {}, roles: string[] = ["frontend"]) {
  const c = { visible_to_members: true, accept_invites: true, smart_match_opt_in: true, looking_for_team: true, ...consent };
  await db.query(
    `insert into public.participations (space_id, user_id, goal, desired_roles, visible_to_members, accept_invites, smart_match_opt_in, looking_for_team, setup_completed)
     values ($1, $2, 'build', $3, $4, $5, $6, $7, true)
     on conflict (space_id, user_id) do update set goal = 'build', desired_roles = excluded.desired_roles,
       visible_to_members = excluded.visible_to_members, accept_invites = excluded.accept_invites,
       smart_match_opt_in = excluded.smart_match_opt_in, looking_for_team = excluded.looking_for_team`,
    [space, userId, roles, c.visible_to_members, c.accept_invites, c.smart_match_opt_in, c.looking_for_team],
  );
  await db.query(`update public.profiles set skills = '{react}', roles = $2, interests = '{education}', availability = $3, bio = 'PRIVATE BIO', university = 'PRIVATE U' where id = $1`, [userId, roles, HOURS]);
}

const writeCounts = async () =>
  (await db.query(`select (select count(*) from public.teams)::int teams, (select count(*) from public.team_members)::int members,
                          (select count(*) from public.invitations)::int invitations, (select count(*) from public.match_runs)::int runs,
                          (select count(*) from public.participations)::int participations`)).rows[0];

beforeAll(async () => {
  db = await dbClient();
  [me, recruiter, plain, outsider, demoUser] = await Promise.all([
    createTestUser({ displayName: "Me Former" }),
    createTestUser({ displayName: "Team Recruiter" }),
    createTestUser({ displayName: "Plain Member" }),
    createTestUser({ displayName: "Outsider" }),
    createTestUser({ displayName: "Demo Persona", appMetadata: { scope: "demo:0", is_synthetic: true } }),
  ]);
  const hack = (title: string) => ({ type: "hackathon", title, edition_year: 2029, start_date: "2029-03-01", end_date: "2029-03-02", timezone: "America/Los_Angeles", format: "online" });
  spaceId = ((await me.client.rpc("create_space", { p_payload: hack(`MatchHack ${TAG}`) })).data as { space_id: string }).space_id;
  otherSpaceId = ((await outsider.client.rpc("create_space", { p_payload: hack(`ElseHack ${TAG}`) })).data as { space_id: string }).space_id;

  for (const n of ["ana", "ben", "cy", "dee", "hidden", "noInvite", "noSmart", "notLooking", "elsewhere"]) await silentUser(n);
  await join(spaceId, me.id, {}, ["backend"]);
  await join(spaceId, recruiter.id, {}, ["pm_pitch"]);
  await join(spaceId, plain.id, {}, ["writing"]);
  await join(spaceId, silent.ana, {}, ["frontend"]);
  await join(spaceId, silent.ben, {}, ["design"]);
  await join(spaceId, silent.cy, {}, ["ai_ml"]);
  await join(spaceId, silent.dee, {}, ["backend"]);
  await join(spaceId, silent.hidden, { visible_to_members: false });
  await join(spaceId, silent.noInvite, { accept_invites: false });
  await join(spaceId, silent.noSmart, { smart_match_opt_in: false });
  await join(spaceId, silent.notLooking, { looking_for_team: false });
  // Fully opted in, but ONLY in another Space.
  await join(otherSpaceId, silent.elsewhere, {}, ["frontend"]);
  await join(otherSpaceId, outsider.id, {}, ["backend"]);

  // The existing team has no React yet, so Grow My Team should report it as missing.
  await db.query(`update public.profiles set skills = '{product}' where id = any($1)`, [[recruiter.id, plain.id]]);

  // Recruiter's team (target 4): recruiter (owner) + plain member; needs frontend.
  const created = await recruiter.client.rpc("create_team", {
    p_space_id: spaceId, p_payload: { name: `Recruiters ${TAG}`, open_positions: 3, requirements: { must_roles: ["frontend"], skills: ["react"] } },
  });
  teamId = (created.data as { team_id: string }).team_id;
  await db.query(`insert into public.team_members (team_id, space_id, user_id) values ($1, $2, $3)`, [teamId, spaceId, plain.id]);
});

afterAll(async () => {
  const everyone = [me, recruiter, plain, outsider, demoUser].map((u) => u.id).concat(Object.values(silent));
  await db.query(`delete from public.matching_spaces where id = any($1)`, [[spaceId, otherSpaceId]]);
  await db.query(`delete from private.api_events where subject = any($1)`, [everyone]);
  await deleteTestUsers([me, recruiter, plain, outsider, demoUser]);
  for (const id of Object.values(silent)) await adminClient().auth.admin.deleteUser(id);
  await db?.end();
});

describe("B/C/D/F: who may be recommended", () => {
  it("returns only fully consenting, team-less participants of THIS Space", async () => {
    const { data, error } = await pool(me, spaceId);
    expect(error).toBeNull();
    expect(ids(data)).toEqual([silent.ana, silent.ben, silent.cy, silent.dee].sort());
  });

  it("C: each consent switch is individually a hard exclusion", async () => {
    const got = new Set(ids((await pool(me, spaceId)).data));
    for (const name of ["hidden", "noInvite", "noSmart", "notLooking"]) expect(got.has(silent[name]), name).toBe(false);
    // Turning the missing switch on makes them eligible; turning it off removes them again.
    await db.query(`update public.participations set smart_match_opt_in = true where space_id = $1 and user_id = $2`, [spaceId, silent.noSmart]);
    expect(ids((await pool(me, spaceId)).data)).toContain(silent.noSmart);
    await db.query(`update public.participations set smart_match_opt_in = false where space_id = $1 and user_id = $2`, [spaceId, silent.noSmart]);
    expect(ids((await pool(me, spaceId)).data)).not.toContain(silent.noSmart);
  });

  it("D: never returns people from another Space, and never the caller", async () => {
    const got = ids((await pool(me, spaceId)).data);
    expect(got).not.toContain(silent.elsewhere);
    expect(got).not.toContain(outsider.id);
    expect(got).not.toContain(me.id);
  });

  it("F: accepted team members are excluded and only counted in aggregate", async () => {
    const { data } = await pool(me, spaceId);
    expect(ids(data)).not.toContain(recruiter.id);
    expect(ids(data)).not.toContain(plain.id);
    expect(data.funnel).toEqual({ others: 10, on_a_team: 2, eligible: 4 });
  });

  it("returns matching features only (no email, bio, university, notes)", async () => {
    const { data } = await pool(me, spaceId);
    const c = data.candidates[0] as Record<string, unknown>;
    expect(Object.keys(c).sort()).toEqual(
      ["availability", "desired_roles", "experience", "goal", "id", "interests", "name", "profile_roles", "skills", "synthetic", "topics", "working_style"].sort(),
    );
    expect(JSON.stringify(data)).not.toMatch(/PRIVATE|@trojanmatch\.test/);
  });
});

describe("D/E/L: who may ask", () => {
  it("rejects anon, non-participants, and users from another scope", async () => {
    expect((await pool(null, spaceId)).error?.code).toBe("42501");
    expect((await pool(outsider, spaceId)).error?.message).toMatch(/^NOT_PARTICIPANT/);
    expect((await pool(demoUser, spaceId)).error?.message).toMatch(/^NOT_FOUND/);
    expect((await pool(me, randomUUID())).error?.message).toMatch(/^NOT_FOUND/);
  });

  it("L: only the owner / delegated recruiter may open a team's candidate list", async () => {
    for (const u of [me, plain, outsider]) {
      const r = await pool(u, spaceId, teamId);
      expect(r.error?.message, u.email).toMatch(/^(NOT_RECRUITER|NOT_PARTICIPANT)/);
    }
    // A real team id used under a different Space is refused the same way.
    expect((await pool(outsider, otherSpaceId, teamId)).error?.message).toMatch(/^NOT_RECRUITER/);
    const ok = await pool(recruiter, spaceId, teamId);
    expect(ok.error).toBeNull();
    expect(ok.data.team!.members.map((m) => m.id).sort()).toEqual([recruiter.id, plain.id].sort());
    // Delegation works; revoking it closes access again.
    await db.query(`update public.team_members set can_recruit = true where team_id = $1 and user_id = $2`, [teamId, plain.id]);
    expect((await pool(plain, spaceId, teamId)).error).toBeNull();
    await db.query(`update public.team_members set can_recruit = false where team_id = $1 and user_id = $2`, [teamId, plain.id]);
    expect((await pool(plain, spaceId, teamId)).error?.message).toMatch(/^NOT_RECRUITER/);
  });

  it("someone already on a team cannot form a second team from scratch", async () => {
    for (const u of [recruiter, plain]) expect((await pool(u, spaceId)).error?.message).toMatch(/^ALREADY_IN_TEAM/);
  });

  it("matching stops when the Space is closed or past its deadline", async () => {
    await db.query(`update public.matching_spaces set team_deadline_at = now() - interval '1 minute' where id = $1`, [spaceId]);
    expect((await pool(me, spaceId)).error?.message).toMatch(/^DEADLINE_PASSED/);
    await db.query(`update public.matching_spaces set team_deadline_at = null, status = 'closed' where id = $1`, [spaceId]);
    expect((await pool(me, spaceId)).error?.message).toMatch(/^SPACE_CLOSED/);
    await db.query(`update public.matching_spaces set status = 'open' where id = $1`, [spaceId]);
  });

  it("the pool function is read-only (STABLE) in the catalog", async () => {
    const { rows } = await db.query(`select provolatile from pg_proc where proname in ('get_match_pool', 'match_person')`);
    expect(rows.map((r) => r.provolatile)).toEqual(["s", "s"]);
  });
});

describe("matching service on the real pool", () => {
  it("M: forming, replacing and recommending never write anything", async () => {
    const before = await writeCounts();
    const p = await loadPool(me.client as never, spaceId);
    const formed = formProposal(p, P({ team_size: 4 }));
    expect(formed.status).toBe("ok");
    const best = formed.proposals[0];
    expect(best.members).toHaveLength(4);
    expect(best.members.filter((m) => m.kind === "you").map((m) => m.id)).toEqual([me.id]);
    const candidates = best.members.filter((m) => m.kind === "candidate").map((m) => m.id);
    expect(candidates).toHaveLength(3);
    for (const id of candidates) expect([silent.ana, silent.ben, silent.cy, silent.dee]).toContain(id);
    // Complementary roles beat a second backend: ana (frontend), ben (design), cy (ai_ml).
    expect(candidates.sort()).toEqual([silent.ana, silent.ben, silent.cy].sort());

    const replaced = replaceCandidate(p, replaceParamsSchema.parse({ team_size: 4, member_ids: candidates, remove_id: silent.cy }));
    expect(replaced.options.map((o) => o.candidate.id)).toEqual([silent.dee]);
    expect(replaced.options[0].delta).toBeLessThan(0);
    expect(replaced.options[0].team.score).toBeCloseTo(replaced.current.score + replaced.options[0].delta, 3);

    const grow = recommendMembers(await loadPool(recruiter.client as never, spaceId, teamId), P({ team_id: teamId }));
    expect(grow.candidates.length).toBeGreaterThan(0);
    expect(await writeCounts()).toEqual(before);
  });

  it("B: a tampered proposal with an ineligible or accepted person is rejected", async () => {
    const p = await loadPool(me.client as never, spaceId);
    const bad = (member_ids: string[], remove_id: string) => () => replaceCandidate(p, replaceParamsSchema.parse({ team_size: 4, member_ids, remove_id }));
    for (const intruder of [silent.hidden, silent.elsewhere, recruiter.id, silent.notLooking]) {
      expect(bad([silent.ana, intruder], silent.ana), intruder).toThrow(ApiError);
    }
    expect(bad([silent.ana, silent.ben], me.id)).toThrow(/Accepted team members/);
    expect(bad([silent.ana, silent.ben, silent.cy, silent.dee], silent.ana)).toThrow(/more people than open positions/);
  });

  it("candidate exclusions are honoured", async () => {
    const p = await loadPool(me.client as never, spaceId);
    const r = formProposal(p, P({ team_size: 4, exclude_ids: [silent.ana] }));
    for (const t of r.proposals) expect(t.members.map((m) => m.id)).not.toContain(silent.ana);
    expect(r.funnel.considered).toBe(3);
  });

  it("K: Grow My Team finds the missing required role and ranks who fills it first", async () => {
    const p = await loadPool(recruiter.client as never, spaceId, teamId);
    const r = recommendMembers(p, P({ team_id: teamId }));
    expect(r.team).toEqual({ id: teamId, name: `Recruiters ${TAG}` });
    expect(r.missing.must_roles).toEqual(["Frontend"]);
    expect(r.missing.skills).toEqual(["React"]);
    expect(r.candidates[0].candidate.id).toBe(silent.ana);
    expect(r.candidates[0].fills_roles).toEqual([{ role: "Frontend", level: "must" }]);
    expect(r.candidates[0].gain).toBeGreaterThan(r.candidates[r.candidates.length - 1].gain);
    expect(r.candidates.every((c) => c.candidate.kind === "candidate")).toBe(true);
  });

  it("G: capacity — accepted members and pending invitations both use up open positions", async () => {
    await recruiter.client.rpc("update_team", { p_team_id: teamId, p_payload: { open_positions: 2 } }); // target 4, 2 members
    let p = await loadPool(recruiter.client as never, spaceId, teamId);
    let r = formProposal(p, P({ team_id: teamId }));
    expect(r.open_slots).toBe(2);
    expect(r.proposals[0].members).toHaveLength(4);
    expect(r.proposals[0].members.filter((m) => m.kind !== "candidate").map((m) => m.id).sort()).toEqual([recruiter.id, plain.id].sort());

    // A pending invitation takes a slot and removes that person from suggestions.
    await db.query(
      `insert into public.invitations (space_id, team_id, kind, user_id, actor_id, expires_at) values ($1, $2, 'invite', $3, $4, now() + interval '1 day')`,
      [spaceId, teamId, silent.ana, recruiter.id],
    );
    p = await loadPool(recruiter.client as never, spaceId, teamId);
    expect(p.candidates.map((c) => c.id)).not.toContain(silent.ana);
    r = formProposal(p, P({ team_id: teamId }));
    expect(r.open_slots).toBe(1);
    expect(r.proposals[0].members).toHaveLength(3);

    // No open positions → no recommendations at all.
    await recruiter.client.rpc("update_team", { p_team_id: teamId, p_payload: { open_positions: 1 } }); // target 3 = 2 members + 1 pending
    p = await loadPool(recruiter.client as never, spaceId, teamId);
    r = formProposal(p, P({ team_id: teamId }));
    expect(r.status).toBe("team_full");
    expect(r.proposals).toEqual([]);
    expect(recommendMembers(p, P({ team_id: teamId })).candidates).toEqual([]);
    await db.query(`delete from public.invitations where team_id = $1`, [teamId]);
  });

  it("an empty pool yields an honest no-match (no invented people)", async () => {
    const p = await loadPool(outsider.client as never, otherSpaceId);
    const r = formProposal(p, P({ team_size: 4, exclude_ids: [silent.elsewhere] }));
    expect(r).toMatchObject({ status: "no_candidates", proposals: [] });
    expect(r.message).toMatch(/No matches yet/);
  });
});

describe("N: demo reset restores matching state; production untouched", () => {
  const SLOT = 7;
  const keys = ["own", "aa", "bb", "cc"];
  let personas: TestUser[] = [];

  const fixture = {
    personas: keys.map((k, i) => ({
      key: k, display_name: `Synthetic ${k}`, university: "USC", bio: "Synthetic.", skills: ["python"], roles: [["backend"], ["frontend"], ["design"], ["ai_ml"]][i],
      interests: ["education"], experience: "intermediate", working_style: {}, availability: HOURS, timezone: "America/Los_Angeles",
      hackathon_goal: "build", course_goal: "aim_a", sim_rank: i,
    })),
    spaces: [{
      key: "h", type: "hackathon", title: `ResetHack ${TAG} 2026`, visibility: "public", creator: "own", min_team_size: 2, max_team_size: 4, team_size_source: "app_default", course: null,
      hackathon: { edition_year: 2026, organizer: "T", official_url: null, start_date: "2026-11-14", end_date: "2026-11-15", timezone: "America/Los_Angeles", format: "online", location: null, rules_url: null },
    }],
    participations: keys.map((k, i) => ({ space: "h", persona: k, goal: "build", desired_roles: [["backend"], ["frontend"], ["design"], ["ai_ml"]][i], topics: [], looking_for_team: true, accept_invites: true, smart_match_opt_in: true, visible_to_members: true, notes: null })),
    teams: [],
  };
  const reset = async () => {
    const { data, error } = await adminClient().rpc("demo_reset_slot", { p_slot: SLOT, p_fixture: fixture as never });
    if (error) throw new Error(error.message);
    return (data as { spaces: { h: { id: string } } }).spaces.h.id;
  };
  const prodDigest = async () =>
    (await db.query(`select md5(coalesce(string_agg(pa.space_id::text || pa.user_id::text || pa.smart_match_opt_in::text || pa.visible_to_members::text, '|' order by pa.space_id, pa.user_id), '')) d,
                            (select count(*)::int from public.teams t join public.matching_spaces s on s.id = t.space_id where s.scope = 'prod') teams
                     from public.participations pa join public.matching_spaces s on s.id = pa.space_id where s.scope = 'prod'`)).rows[0];

  beforeAll(async () => {
    personas = await Promise.all(keys.map((k) => createTestUser({ displayName: `Synthetic ${k}`, appMetadata: { scope: `demo:${SLOT}`, is_synthetic: true } })));
    const { error } = await adminClient().rpc("demo_register_personas", { p_slot: SLOT, p_personas: personas.map((u, i) => ({ persona_key: keys[i], user_id: u.id, switchable: false })) });
    expect(error).toBeNull();
  });
  afterAll(async () => {
    await db.query(`delete from public.matching_spaces where scope = $1`, [`demo:${SLOT}`]);
    await deleteTestUsers(personas);
  });

  it("E: demo candidates are synthetic, in-sandbox only, and invisible to production users", async () => {
    const space = await reset();
    const p = await loadPool(personas[0].client as never, space);
    expect(p.candidates.map((c) => c.id).sort()).toEqual(personas.slice(1).map((u) => u.id).sort());
    expect(p.candidates.every((c) => c.synthetic)).toBe(true);
    expect((await pool(me, space)).error?.message).toMatch(/^NOT_FOUND/);
  });

  it("N: after changes inside the sandbox, reset returns the same proposal as before", async () => {
    const prodBefore = await prodDigest();
    let space = await reset();
    const first = formProposal(await loadPool(personas[0].client as never, space), P({ team_size: 4 }));
    const names = (r: typeof first) => r.proposals[0].members.map((m) => `${m.name}:${m.role}`).sort();
    expect(first.funnel).toMatchObject({ others: 3, eligible: 3 });

    // Drift: one persona opts out, another forms a team.
    await personas[1].client.from("participations").update({ smart_match_opt_in: false }).eq("space_id", space);
    await personas[2].client.rpc("create_team", { p_space_id: space, p_payload: { name: "Drift", open_positions: 1 } });
    const drifted = formProposal(await loadPool(personas[0].client as never, space), P({ team_size: 4 }));
    expect(drifted.funnel).toMatchObject({ eligible: 1, on_a_team: 1 });
    expect(drifted.status).toBe("not_enough_candidates");

    space = await reset();
    const again = formProposal(await loadPool(personas[0].client as never, space), P({ team_size: 4 }));
    expect(again.funnel).toEqual(first.funnel);
    expect(names(again)).toEqual(names(first));
    expect(again.proposals[0].score).toBe(first.proposals[0].score);
    expect(await prodDigest()).toEqual(prodBefore);
  });
});
