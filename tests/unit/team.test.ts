import { describe, expect, it } from "vitest";
import { DEMO_PARTICIPATIONS, DEMO_SPACES, DEMO_TEAMS } from "@/lib/demo/fixtures";
import { SWITCHABLE_PERSONAS } from "@/lib/demo/personas";
import { createTeamSchema, teamRequirementsSchema, updateTeamSchema } from "@/lib/validation/team";

const base = { name: "Pixel Pushers", description: "", open_positions: 2, recruiting: true };

describe("team schemas", () => {
  it("accepts structured requirements and drops empty fields", () => {
    const r = createTeamSchema("hackathon").parse({
      ...base,
      requirements: { must_roles: ["frontend"], preferred_roles: [], skills: ["react", "Unity 3D"], topics: [], goal: "build", min_shared_hours: 6, note: "" },
    });
    expect(r.requirements).toEqual({ must_roles: ["frontend"], skills: ["react", "unity 3d"], goal: "build", min_shared_hours: 6 });
  });
  it("enforces per-type goals, known roles, limits and no role overlap", () => {
    const bad = [
      { goal: "aim_a" },
      { must_roles: ["ceo"] },
      { min_shared_hours: 41 },
      { skills: Array.from({ length: 21 }, (_, i) => `s${i}`) },
      { must_roles: ["frontend"], preferred_roles: ["frontend"] },
      { vibe: "chill" },
    ];
    for (const requirements of bad) {
      expect(createTeamSchema("hackathon").safeParse({ ...base, requirements }).success, JSON.stringify(requirements)).toBe(false);
    }
    expect(teamRequirementsSchema("course").safeParse({ goal: "aim_a" }).success).toBe(true);
  });
  it("create needs at least one open position; edit may close recruiting with zero", () => {
    expect(createTeamSchema("hackathon").safeParse({ ...base, open_positions: 0, requirements: {} }).success).toBe(false);
    expect(updateTeamSchema("hackathon").safeParse({ ...base, open_positions: 0, recruiting: false, requirements: {} }).success).toBe(true);
    expect(createTeamSchema("hackathon").safeParse({ ...base, name: "x", requirements: {} }).success).toBe(false);
  });
});

describe("demo fixture teams", () => {
  const spaceByKey = Object.fromEntries(DEMO_SPACES.map((s) => [s.key, s]));
  const members = (space: string) => new Set(DEMO_PARTICIPATIONS.filter((p) => p.space === space).map((p) => p.persona));
  const switchable = new Set<string>(SWITCHABLE_PERSONAS.map((p) => p.key));

  it("every seeded team is valid for its Space", () => {
    const seen = new Map<string, string>();
    for (const t of DEMO_TEAMS) {
      const s = spaceByKey[t.space];
      expect(s, t.name).toBeDefined();
      const r = teamRequirementsSchema(s.type).safeParse(t.requirements);
      expect(r.success, t.name).toBe(true);
      const size = 1 + t.members.length;
      expect(t.target_size).toBeGreaterThanOrEqual(Math.max(s.min_team_size, 2));
      expect(t.target_size).toBeLessThanOrEqual(s.max_team_size);
      expect(size).toBeLessThanOrEqual(t.target_size);
      if (t.status === "active") expect(size).toBeGreaterThanOrEqual(Math.max(s.min_team_size, 2));
      for (const p of [t.owner, ...t.members]) {
        expect(members(t.space).has(p), `${p} in ${t.space}`).toBe(true);
        expect(switchable.has(p), `${p} must stay free for the live demo`).toBe(false);
        expect(seen.get(`${t.space}:${p}`), `${p} on two teams in ${t.space}`).toBeUndefined();
        seen.set(`${t.space}:${p}`, t.name);
      }
    }
    expect(DEMO_TEAMS.some((t) => t.status === "active")).toBe(true);
    expect(DEMO_TEAMS.every((t) => t.recruiting)).toBe(true);
  });

  it("team members are marked as not looking for a team", () => {
    for (const t of DEMO_TEAMS) {
      for (const p of [t.owner, ...t.members]) {
        const part = DEMO_PARTICIPATIONS.find((x) => x.space === t.space && x.persona === p);
        expect(part?.looking_for_team, p).toBe(false);
      }
    }
  });
});
