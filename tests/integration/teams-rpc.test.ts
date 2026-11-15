/**
 * P4-A Team Foundation — RPCs called DIRECTLY through PostgREST as real users,
 * plus PostgreSQL constraint/trigger checks.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { ROLES } from "@/lib/taxonomy";
import { adminClient, anonClient, createTestUser, dbClient, deleteTestUsers, type TestUser } from "./helpers";

const TAG = Array.from(randomBytes(5), (b) => String.fromCharCode(97 + (b % 26))).join("");

let db: pg.Client;
let owner: TestUser;     // creates teams
let other: TestUser;     // unrelated participant in the same Space
let outsider: TestUser;  // not in the Space
let demoUser: TestUser;  // synthetic, demo scope
let hackId: string;      // public hackathon (2–4)
let courseId: string;    // course (3–4)
let otherSpaceId: string;

const req = {
  must_roles: ["frontend"],
  preferred_roles: ["design"],
  skills: ["react", "figma"],
  topics: ["education"],
  goal: "build",
  min_shared_hours: 6,
  note: "Need a UI person",
};

type R<T = Record<string, unknown>> = { data: T; error: { code?: string; message: string } | null };
const rpc = async <T = Record<string, unknown>>(u: TestUser | null, fn: string, args: Record<string, unknown>) =>
  ((u ? u.client : anonClient()).rpc(fn as never, args as never) as unknown) as Promise<R<T>>;
const createTeam = (u: TestUser, spaceId: string, payload: Record<string, unknown>) =>
  rpc<{ team_id: string; target_size: number }>(u, "create_team", { p_space_id: spaceId, p_payload: payload });
const updateTeam = (u: TestUser, teamId: string, payload: Record<string, unknown>) =>
  rpc<{ open_positions: number; target_size: number }>(u, "update_team", { p_team_id: teamId, p_payload: payload });

async function space(u: TestUser, payload: Record<string, unknown>) {
  const { data, error } = await rpc<{ space_id: string; join_code: string | null }>(u, "create_space", { p_payload: payload });
  if (error) throw new Error(error.message);
  return data;
}

beforeAll(async () => {
  db = await dbClient();
  [owner, other, outsider, demoUser] = await Promise.all([
    createTestUser({ displayName: "Team Owner" }),
    createTestUser({ displayName: "Other Participant" }),
    createTestUser({ displayName: "Outsider" }),
    createTestUser({ displayName: "Demo Persona", appMetadata: { scope: "demo:0", is_synthetic: true } }),
  ]);
  const hack = await space(owner, {
    type: "hackathon", title: `TeamHack ${TAG}`, edition_year: 2027, start_date: "2027-03-01", end_date: "2027-03-02",
    timezone: "America/Los_Angeles", format: "online",
  });
  hackId = hack.space_id;
  const course = await space(owner, {
    type: "course", university: "USC", term: "Fall 2026", course_code: `CS ${TAG}`, assignment_name: "Project",
    allowed_sections: ["1"], min_team_size: 3, max_team_size: 4, visibility: "unlisted",
  });
  courseId = course.space_id;
  otherSpaceId = (await space(other, {
    type: "hackathon", title: `OtherHack ${TAG}`, edition_year: 2027, start_date: "2027-03-01", end_date: "2027-03-02",
    timezone: "America/Los_Angeles", format: "online",
  })).space_id;
  await rpc(other, "join_space", { p_space_id: hackId });
});

afterAll(async () => {
  const ids = [owner, other, outsider, demoUser].map((u) => u.id);
  await db.query(`delete from public.matching_spaces where created_by = any($1)`, [ids]);
  await db.query(`delete from private.api_events where subject = any($1)`, [ids]);
  await deleteTestUsers([owner, other, outsider, demoUser]);
  await db?.end();
});

describe("create_team", () => {
  let teamId: string;

  it("A/B/C: a participant creates a team, becomes the owner, and requirements persist", async () => {
    const { data, error } = await createTeam(owner, hackId, {
      name: "Pixel Pushers", description: "We build fast.", open_positions: 2, requirements: req,
    });
    expect(error).toBeNull();
    teamId = data.team_id;
    expect(data.target_size).toBe(3);

    const { rows: t } = await db.query(`select owner_id, status, recruiting, target_size, requirements from public.teams where id = $1`, [teamId]);
    expect(t[0]).toMatchObject({ owner_id: owner.id, status: "draft", recruiting: true, target_size: 3 });
    expect(t[0].requirements).toEqual(req);

    const { rows: m } = await db.query(`select user_id, role, can_recruit, status from public.team_members where team_id = $1`, [teamId]);
    expect(m).toEqual([{ user_id: owner.id, role: "owner", can_recruit: true, status: "active" }]);
  });

  it("creating a Space did not create a team, and creating a team grants nothing elsewhere", async () => {
    const { rows } = await db.query(`select count(*)::int n from public.teams where space_id = $1`, [courseId]);
    expect(rows[0].n).toBe(0);
  });

  it("prevents a second active team in the same Space (one-team-per-Space)", async () => {
    const { error } = await createTeam(owner, hackId, { name: "Second Team", open_positions: 1 });
    expect(error?.message).toMatch(/^ALREADY_IN_TEAM/);
  });

  it("allows a team in a different Space", async () => {
    const { error } = await createTeam(owner, courseId, { name: "Course Crew", open_positions: 2, requirements: { goal: "aim_a" } });
    expect(error).toBeNull();
  });

  it("requires Space participation, matching scope, and auth", async () => {
    expect((await createTeam(outsider, hackId, { name: "Gatecrash", open_positions: 1 })).error?.message).toMatch(/^NOT_PARTICIPANT/);
    expect((await createTeam(demoUser, hackId, { name: "Cross scope", open_positions: 1 })).error?.message).toMatch(/^NOT_FOUND/);
    expect((await rpc(null, "create_team", { p_space_id: hackId, p_payload: { name: "Anon", open_positions: 1 } })).error?.code).toBe("42501");
  });

  it("F: enforces the Space's team size bounds", async () => {
    // Hackathon is 2–4 → owner + 4 open = 5 > 4.
    expect((await createTeam(other, hackId, { name: "Too Big", open_positions: 4 })).error?.message).toMatch(/^INVALID_INPUT: Team size must be between 2 and 4/);
    expect((await createTeam(other, hackId, { name: "No Room", open_positions: 0 })).error?.message).toMatch(/^INVALID_INPUT/);
  });

  it("respects Space status and team deadlines", async () => {
    await db.query(`update public.matching_spaces set team_deadline_at = now() - interval '1 minute' where id = $1`, [otherSpaceId]);
    expect((await createTeam(other, otherSpaceId, { name: "Late", open_positions: 1 })).error?.message).toMatch(/^DEADLINE_PASSED/);
    await db.query(`update public.matching_spaces set team_deadline_at = null, status = 'closed' where id = $1`, [otherSpaceId]);
    expect((await createTeam(other, otherSpaceId, { name: "Closed", open_positions: 1 })).error?.message).toMatch(/^SPACE_CLOSED/);
    await db.query(`update public.matching_spaces set status = 'open' where id = $1`, [otherSpaceId]);
  });

  it("validates structured requirements in PostgreSQL", async () => {
    const bad: [string, Record<string, unknown>][] = [
      ["unknown role", { must_roles: ["ceo"] }],
      ["unknown key", { vibe: "chill" }],
      ["too many skills", { skills: Array.from({ length: 21 }, (_, i) => `s${i}`) }],
      ["bad tag", { topics: ["<script>"] }],
      ["hours out of range", { min_shared_hours: 99 }],
      ["course goal on a hackathon", { goal: "aim_a" }],
      ["note too long", { note: "x".repeat(501) }],
      ["not an object", ["frontend"] as unknown as Record<string, unknown>],
    ];
    for (const [label, requirements] of bad) {
      const { error } = await createTeam(other, hackId, { name: `Bad ${label}`, open_positions: 1, requirements });
      expect(error?.message, label).toMatch(/^INVALID_INPUT/);
    }
  });

  it("the DB CHECK constraint rejects invalid requirements even for direct writes", async () => {
    await db.query("begin");
    try {
      await db.query(`update public.teams set requirements = '{"must_roles":["wizard"]}' where id = $1`, [teamId]);
      throw new Error("should have failed");
    } catch (e) {
      expect((e as { code?: string }).code).toBe("23514");
    } finally {
      await db.query("rollback").catch(() => undefined);
    }
  });

  it("role ids in PostgreSQL stay in sync with lib/taxonomy.ts", async () => {
    const { rows } = await db.query(`select private.valid_team_requirements($1::jsonb) ok`, [
      JSON.stringify({ must_roles: ROLES.slice(0, 6).map((r) => r.id), preferred_roles: ROLES.slice(6).map((r) => r.id) }),
    ]);
    expect(rows[0].ok).toBe(true);
  });

  describe("update_team", () => {
    it("D: the owner updates requirements, open positions and recruiting", async () => {
      const next = { ...req, must_roles: ["frontend", "ai_ml"], min_shared_hours: 8 };
      const { data, error } = await updateTeam(owner, teamId, { requirements: next, open_positions: 3, description: "Updated" });
      expect(error).toBeNull();
      expect(data).toMatchObject({ target_size: 4, open_positions: 3 });
      const { rows } = await db.query(`select requirements, target_size, description from public.teams where id = $1`, [teamId]);
      expect(rows[0]).toEqual({ requirements: next, target_size: 4, description: "Updated" });
    });

    it("D: a delegated recruiter (can_recruit) may update; a plain member may not", async () => {
      await db.query(`insert into public.team_members (team_id, space_id, user_id, role, can_recruit) values ($1, $2, $3, 'member', false)`, [teamId, hackId, other.id]);
      expect((await updateTeam(other, teamId, { name: "Hijacked" })).error?.message).toMatch(/^NOT_RECRUITER/);
      await db.query(`update public.team_members set can_recruit = true where team_id = $1 and user_id = $2`, [teamId, other.id]);
      expect((await updateTeam(other, teamId, { note: undefined, name: "Pixel Pushers+" })).error).toBeNull();
      await db.query(`delete from public.team_members where team_id = $1 and user_id = $2`, [teamId, other.id]);
    });

    it("E: unrelated participants, outsiders, other scopes and anon cannot edit", async () => {
      for (const u of [other, outsider, demoUser]) {
        const { error } = await updateTeam(u, teamId, { name: "Hijacked" });
        expect(error?.message, u.email).toMatch(/^NOT_RECRUITER/);
      }
      expect((await rpc(null, "update_team", { p_team_id: teamId, p_payload: { name: "x" } })).error?.code).toBe("42501");
      const { rows } = await db.query(`select name from public.teams where id = $1`, [teamId]);
      expect(rows[0].name).toBe("Pixel Pushers+");
    });

    it("F: capacity — target can't exceed the Space max or drop below accepted members", async () => {
      expect((await updateTeam(owner, teamId, { open_positions: 4 })).error?.message).toMatch(/^INVALID_INPUT: Team size/);
      // Members fill to capacity; the trigger blocks one more.
      await updateTeam(owner, teamId, { open_positions: 1 }); // target 2
      await db.query(`insert into public.team_members (team_id, space_id, user_id) values ($1, $2, $3)`, [teamId, hackId, other.id]);
      const third = await createTestUser(); // auth user lives outside the SQL transaction
      await db.query("begin");
      try {
        await db.query(`insert into public.participations (space_id, user_id) values ($1, $2)`, [hackId, third.id]);
        await db.query(`insert into public.team_members (team_id, space_id, user_id) values ($1, $2, $3)`, [teamId, hackId, third.id]);
        throw new Error("capacity not enforced");
      } catch (e) {
        expect((e as Error).message).toMatch(/TEAM_FULL/);
      } finally {
        await db.query("rollback").catch(() => undefined);
        await deleteTestUsers([third]);
      }
      // Recruiting with zero open positions is refused; shrinking below members too.
      expect((await updateTeam(owner, teamId, { recruiting: true })).error?.message).toMatch(/^TEAM_FULL/);
      expect((await updateTeam(owner, teamId, { open_positions: 0, recruiting: false })).error).toBeNull();
      await db.query(`delete from public.team_members where team_id = $1 and user_id = $2`, [teamId, other.id]);
    });

    it("one active team per user per Space holds at the DB level", async () => {
      const { data } = await createTeam(other, hackId, { name: "Other Team", open_positions: 1 });
      await db.query("begin");
      try {
        await db.query(`insert into public.team_members (team_id, space_id, user_id) values ($1, $2, $3)`, [data.team_id, hackId, owner.id]);
        throw new Error("one-team-per-space not enforced");
      } catch (e) {
        expect((e as { code?: string }).code).toBe("23505");
      } finally {
        await db.query("rollback").catch(() => undefined);
      }
    });
  });
});

describe("visibility (RLS)", () => {
  it("participants see recruiting teams; non-participants and other scopes see nothing", async () => {
    const { rows } = await db.query(`select id from public.teams where space_id = $1 and owner_id = $2`, [hackId, owner.id]);
    const teamId = rows[0].id;
    await updateTeam(owner, teamId, { open_positions: 2, recruiting: true });

    expect((await other.client.from("teams").select("id").eq("id", teamId)).data).toHaveLength(1);
    expect((await outsider.client.from("teams").select("id").eq("id", teamId)).data).toEqual([]);
    expect((await demoUser.client.from("teams").select("id").eq("id", teamId)).data).toEqual([]);

    // A non-recruiting draft is private to its members.
    await updateTeam(owner, teamId, { recruiting: false });
    expect((await other.client.from("teams").select("id").eq("id", teamId)).data).toEqual([]);
    expect((await owner.client.from("teams").select("id").eq("id", teamId)).data).toHaveLength(1);
  });

  it("direct writes to teams and team_members are denied", async () => {
    const { error: e1 } = await owner.client.from("teams").update({ name: "direct" } as never).eq("owner_id", owner.id);
    expect(e1?.code).toBe("42501");
    const { error: e2 } = await owner.client.from("team_members").insert({ team_id: crypto.randomUUID(), space_id: hackId, user_id: owner.id } as never);
    expect(e2?.code).toBe("42501");
  });
});

describe("demo reset loads valid synthetic teams without touching production", () => {
  const SLOT = 8;
  let personas: TestUser[] = [];

  beforeAll(async () => {
    personas = await Promise.all(
      ["own", "mem", "solo"].map((k) => createTestUser({ displayName: `Synthetic ${k}`, appMetadata: { scope: `demo:${SLOT}`, is_synthetic: true } })),
    );
    await adminClient().rpc("demo_register_personas", {
      p_slot: SLOT, p_personas: personas.map((u, i) => ({ persona_key: ["own", "mem", "solo"][i], user_id: u.id, switchable: false })),
    });
  });
  afterAll(async () => {
    await db.query(`delete from public.matching_spaces where scope = $1`, [`demo:${SLOT}`]);
    await deleteTestUsers(personas);
  });

  const fixture = (teams: unknown[]) => ({
    personas: ["own", "mem", "solo"].map((k) => ({
      key: k, display_name: `Synthetic ${k}`, university: "USC", bio: "Synthetic.", skills: ["python"], roles: ["backend"],
      interests: ["education"], experience: "intermediate", working_style: {}, availability: [20], timezone: "America/Los_Angeles",
      hackathon_goal: "build", course_goal: "aim_a", sim_rank: 1,
    })),
    spaces: [{
      key: "h", type: "hackathon", title: `SeedHack ${TAG} 2026`, visibility: "public", creator: "own", min_team_size: 2, max_team_size: 4,
      team_size_source: "app_default", course: null,
      hackathon: { edition_year: 2026, organizer: "T", official_url: null, start_date: "2026-11-14", end_date: "2026-11-15", timezone: "America/Los_Angeles", format: "online", location: null, rules_url: null },
    }],
    participations: ["own", "mem", "solo"].map((k) => ({ space: "h", persona: k, goal: "build", desired_roles: [], topics: [], looking_for_team: true, accept_invites: true, smart_match_opt_in: true, visible_to_members: true, notes: null })),
    teams,
  });

  const prodSnapshot = async () => (await db.query(`
    select (select count(*) from public.teams t join public.matching_spaces s on s.id = t.space_id where s.scope = 'prod')::int teams,
           (select md5(coalesce(string_agg(t.id::text || t.name || t.target_size || t.requirements::text, '|' order by t.id), '')) from public.teams t join public.matching_spaces s on s.id = t.space_id where s.scope = 'prod') digest,
           (select count(*) from public.team_members m join public.matching_spaces s on s.id = m.space_id where s.scope = 'prod')::int members`)).rows[0];

  it("H/I: restores valid recruiting teams; production teams unchanged", async () => {
    const before = await prodSnapshot();
    const teams = [
      { space: "h", name: "Seeded Active", description: null, owner: "own", members: ["mem"], status: "active", recruiting: true, target_size: 4, requirements: req },
      { space: "h", name: "Seeded Draft", description: null, owner: "solo", members: [], status: "draft", recruiting: true, target_size: 3, requirements: { goal: "learn" } },
    ];
    const { data, error } = await adminClient().rpc("demo_reset_slot", { p_slot: SLOT, p_fixture: fixture(teams) as never });
    expect(error).toBeNull();
    expect((data as { teams: number }).teams).toBe(2);
    const { rows } = await db.query(
      `select t.name, t.status, (select count(*)::int from public.team_members m where m.team_id = t.id and m.status = 'active') members
       from public.teams t join public.matching_spaces s on s.id = t.space_id where s.scope = $1 order by 1`,
      [`demo:${SLOT}`],
    );
    expect(rows).toEqual([{ name: "Seeded Active", status: "active", members: 2 }, { name: "Seeded Draft", status: "draft", members: 1 }]);
    expect(await prodSnapshot()).toEqual(before);
  });

  it("rejects invalid seeded teams (over capacity, active below minimum, bad requirements) atomically", async () => {
    const cases: [string, unknown[]][] = [
      ["over capacity", [{ space: "h", name: "Overfull", owner: "own", members: ["mem", "solo"], status: "draft", recruiting: true, target_size: 2, requirements: {} }]],
      ["active below min", [{ space: "h", name: "Lonely Active", owner: "own", members: [], status: "active", recruiting: true, target_size: 3, requirements: {} }]],
      ["bad requirements", [{ space: "h", name: "Bad Req", owner: "own", members: [], status: "draft", recruiting: true, target_size: 3, requirements: { must_roles: ["wizard"] } }]],
      ["over Space max", [{ space: "h", name: "Huge", owner: "own", members: [], status: "draft", recruiting: true, target_size: 9, requirements: {} }]],
    ];
    for (const [label, teams] of cases) {
      const { error } = await adminClient().rpc("demo_reset_slot", { p_slot: SLOT, p_fixture: fixture(teams) as never });
      expect(error, label).not.toBeNull();
    }
    // The previous valid state survived (each failed reset rolled back).
    const { rows } = await db.query(`select count(*)::int n from public.teams t join public.matching_spaces s on s.id = t.space_id where s.scope = $1`, [`demo:${SLOT}`]);
    expect(rows[0].n).toBe(2);
  });
});
