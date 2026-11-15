import { describe, expect, it } from "vitest";
import { DEMO_PERSONAS } from "@/lib/demo/fixtures";
import {
  PART_KEYS, PRESETS, band, buildContext, defaultRolesFor, evaluate, formTeam, goalCompat, growRecommendations,
  interestSimilarity, rankIndividually, replaceOptions, styleCompat, type Needs, type Person,
} from "@/lib/matching/engine";

const HOURS = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
let seq = 0;
function person(over: Partial<Person> & { id?: string } = {}): Person {
  seq++;
  return {
    id: over.id ?? `p${String(seq).padStart(3, "0")}`,
    name: over.name ?? `Person ${seq}`,
    synthetic: true,
    skills: [], roles: [], interests: ["education"], experience: "intermediate",
    style: { sync: "mixed", planning: "mixed", comm: "few_times_week" },
    availability: HOURS(20, 12), goal: "build",
    ...over,
  };
}
const needs = (over: Partial<Needs> = {}): Needs => ({
  spaceType: "hackathon", mustRoles: [], preferredRoles: [], defaultRoles: defaultRolesFor("hackathon", 4),
  skills: [], topics: [], goal: null, minSharedHours: null, hardRoles: false, hardHours: false, ...over,
});
const W = PRESETS.balanced.weights;

describe("normalized components", () => {
  it("weights of every preset sum to 1", () => {
    for (const p of Object.values(PRESETS)) expect(PART_KEYS.reduce((s, k) => s + p.weights[k], 0)).toBeCloseTo(1, 10);
  });
  it("goal compatibility is symmetric, 1 when equal, lower when further apart, neutral when unknown", () => {
    expect(goalCompat("hackathon", "build", "build")).toBe(1);
    expect(goalCompat("hackathon", "learn", "build")).toBe(0.6);
    expect(goalCompat("hackathon", "learn", "competitive")).toBe(0.2);
    expect(goalCompat("hackathon", "competitive", "learn")).toBe(0.2);
    expect(goalCompat("course", "aim_a", null)).toBe(0.5);
    // "Competitive" is not worth more than "learn": only similarity counts.
    expect(goalCompat("hackathon", "competitive", "competitive")).toBe(goalCompat("hackathon", "learn", "learn"));
  });
  it("interest similarity rewards exact tags over same-group tags", () => {
    const exact = interestSimilarity(["llm-agents"], ["llm-agents"]);
    const sameGroup = interestSimilarity(["llm-agents"], ["generative-ai"]);
    const unrelated = interestSimilarity(["llm-agents"], ["fintech"]);
    expect(exact).toBe(1);
    expect(sameGroup).toBeGreaterThan(unrelated);
    expect(sameGroup).toBeLessThan(exact);
    expect(unrelated).toBe(0);
    expect(interestSimilarity([], ["fintech"])).toBe(0.5);
  });
  it("working-style compatibility is in [0,1] and symmetric", () => {
    const a = { sync: "sync", planning: "plan_first", comm: "daily" };
    const b = { sync: "async", planning: "iterate_fast", comm: "weekly" };
    expect(styleCompat(a, a)).toBe(1);
    expect(styleCompat(a, b)).toBe(styleCompat(b, a));
    expect(styleCompat(a, b)).toBe(0.25);
    expect(styleCompat(a, {})).toBe(0.5);
  });
  it("every part and the total stay within [0,1]", () => {
    const people = DEMO_PERSONAS.slice(0, 12).map((p, i) => person({ id: `d${i}`, skills: p.skills, roles: p.roles, interests: p.interests, availability: p.availability, goal: p.hackathon_goal, style: p.working_style }));
    const ctx = buildContext(people, needs(), W);
    const e = evaluate(ctx, people.slice(0, 4).map((p) => p.id));
    for (const k of PART_KEYS) {
      expect(e.parts[k]).toBeGreaterThanOrEqual(0);
      expect(e.parts[k]).toBeLessThanOrEqual(1);
    }
    expect(e.total).toBeGreaterThan(0);
    expect(e.total).toBeLessThanOrEqual(1);
    expect(["Strong", "Good", "Fair", "Weak"]).toContain(band(e.total));
  });
});

describe("A. complementary roles and skills improve coverage", () => {
  const me = person({ id: "me", roles: ["backend"], skills: ["python", "databases"] });
  const clone = person({ id: "clone", roles: ["backend"], skills: ["python", "databases"] });
  const front = person({ id: "front", roles: ["frontend"], skills: ["react", "figma"] });
  const n = needs({ mustRoles: ["backend", "frontend"], skills: ["python", "react"] });
  const ctx = buildContext([me, clone, front], n, W);

  it("a complementary teammate scores higher than a duplicate", () => {
    const dup = evaluate(ctx, ["me", "clone"]);
    const comp = evaluate(ctx, ["me", "front"]);
    expect(comp.roleCoverage).toBe(1);
    expect(dup.roleCoverage).toBe(0.5);
    expect(comp.skillsMissing).toEqual([]);
    expect(dup.skillsMissing).toEqual(["react"]);
    expect(comp.total).toBeGreaterThan(dup.total);
    expect(comp.assignment).toEqual({ me: "backend", front: "frontend" });
    expect(dup.roles.find((r) => r.role === "frontend")).toMatchObject({ status: "missing", by: null });
  });

  it("one person can only be the dedicated owner of one role", () => {
    const fullstack = person({ id: "fs", roles: ["backend", "frontend"] });
    const c = buildContext([fullstack], n, W);
    const e = evaluate(c, ["fs"]);
    expect(e.roleCoverage).toBe(0.75); // one role dedicated (1.0) + one on the side (0.5)
    expect(e.roles.map((r) => r.status).sort()).toEqual(["covered", "partial"]);
  });

  it("a flexible member partially covers an otherwise missing role", () => {
    const flex = person({ id: "flex", roles: ["flexible"] });
    const c = buildContext([me, flex], n, W);
    const e = evaluate(c, ["me", "flex"]);
    expect(e.roles.find((r) => r.role === "frontend")).toMatchObject({ status: "partial", by: "flex" });
    expect(e.roleCoverage).toBe(0.75);
  });
});

describe("schedule overlap uses hours when EVERYONE is free", () => {
  it("intersects availability and caps at the target", () => {
    const a = person({ id: "a", availability: HOURS(0, 10) });
    const b = person({ id: "b", availability: HOURS(5, 10) });
    const c = person({ id: "c", availability: HOURS(8, 10) });
    const ctx = buildContext([a, b, c], needs({ minSharedHours: 4 }), W);
    expect(evaluate(ctx, ["a", "b"]).sharedHours).toBe(5);
    const all = evaluate(ctx, ["a", "b", "c"]);
    expect(all.sharedHours).toBe(2);
    expect(all.sharedHourList).toEqual([8, 9]);
    expect(all.parts.schedule).toBe(0.5);
    expect(evaluate(ctx, ["a", "b"]).parts.schedule).toBe(1);
  });
});

// A constructed Space: three near-identical frontends who each look best individually,
// plus an ML engineer and a designer who look slightly worse one by one.
function constructed() {
  const me = person({ id: "me", roles: ["backend"], skills: ["python", "databases"], interests: ["education", "llm-agents"] });
  const twin = (id: string) => person({ id, roles: ["frontend"], skills: ["react", "typescript"], interests: ["education", "llm-agents"] });
  const ml = person({ id: "ml", roles: ["ai_ml"], skills: ["pytorch", "ml"], interests: ["education"], goal: "competitive" });
  const des = person({ id: "des", roles: ["design"], skills: ["figma", "ui-ux"], interests: ["education"], style: { sync: "sync", planning: "mixed", comm: "few_times_week" } });
  const people = [me, twin("f1"), twin("f2"), twin("f3"), ml, des];
  return { people, pool: ["f1", "f2", "f3", "ml", "des"], ctx: buildContext(people, needs(), W) };
}

describe("I. whole-team optimization vs individual-ranking baseline", () => {
  it("the individually best candidates are all the same role", () => {
    const { ctx, pool } = constructed();
    const ranked = rankIndividually(ctx, ["me"], pool);
    expect(ranked.slice(0, 3).map((r) => r.id)).toEqual(["f1", "f2", "f3"]);
  });
  it("the optimizer picks a complementary team that beats the baseline", () => {
    const { ctx, pool } = constructed();
    const r = formTeam(ctx, ["me"], pool, 3);
    expect(r.status).toBe("ok");
    expect(r.method).toBe("exhaustive");
    const best = r.teams[0];
    expect([...best.memberIds].sort()).toEqual(["des", "f1", "me", "ml"]);
    expect([...r.baseline!.memberIds].sort()).toEqual(["f1", "f2", "f3", "me"]);
    expect(best.total).toBeGreaterThan(r.baseline!.total + 0.05);
    expect(best.roleCoverage).toBe(1);
    expect(r.baseline!.roleCoverage).toBeLessThan(0.6);
  });
});

describe("H. determinism", () => {
  it("returns identical results regardless of input order, across repeated runs", () => {
    const { people, pool } = constructed();
    const run = (ps: Person[], pl: string[]) => JSON.stringify(formTeam(buildContext(ps, needs(), W), ["me"], pl, 3));
    const a = run(people, pool);
    expect(run([...people].reverse(), [...pool].reverse())).toBe(a);
    expect(run(people, pool)).toBe(a);
  });
  it("breaks exact ties by member id", () => {
    const me = person({ id: "me", roles: ["backend"] });
    const twins = ["t3", "t1", "t2"].map((id) => person({ id, roles: ["frontend"] }));
    const r = formTeam(buildContext([me, ...twins], needs(), W), ["me"], ["t3", "t2", "t1"], 1);
    expect(r.teams[0].memberIds).toContain("t1");
    expect(r.teams.map((t) => t.memberIds.find((m) => m !== "me"))).toEqual(["t1", "t2", "t3"]);
  });
});

describe("G. capacity and candidate hygiene", () => {
  it("never exceeds fixed members + open slots and never repeats a person", () => {
    const { ctx, pool } = constructed();
    for (const slots of [1, 2, 3]) {
      const r = formTeam(ctx, ["me"], pool, slots);
      for (const t of r.teams) {
        expect(t.memberIds).toHaveLength(1 + slots);
        expect(new Set(t.memberIds).size).toBe(t.memberIds.length);
        expect(t.memberIds).toContain("me");
      }
    }
  });
  it("only uses people from the eligible pool (exclusions are honoured)", () => {
    const { ctx, pool } = constructed();
    const r = formTeam(ctx, ["me"], pool.filter((id) => id !== "ml"), 3);
    for (const t of r.teams) expect(t.memberIds).not.toContain("ml");
  });
  it("alternatives differ in more than half of the open slots", () => {
    const { ctx, pool } = constructed();
    const r = formTeam(ctx, ["me"], pool, 2);
    expect(r.teams.length).toBeGreaterThan(1);
    const [a, ...rest] = r.teams.map((t) => t.memberIds.filter((m) => m !== "me"));
    for (const b of rest) expect(b.filter((x) => a.includes(x)).length).toBeLessThanOrEqual(1);
  });
});

describe("insufficient candidates and hard requirements", () => {
  it("returns no team (and no invented people) when nobody is eligible", () => {
    const me = person({ id: "me" });
    const r = formTeam(buildContext([me], needs(), W), ["me"], [], 3);
    expect(r).toMatchObject({ status: "no_candidates", teams: [], poolSize: 0 });
  });
  it("proposes a smaller team when the pool is too small, and says so", () => {
    const { ctx } = constructed();
    const r = formTeam(ctx, ["me"], ["ml"], 3);
    expect(r.status).toBe("not_enough_candidates");
    expect(r.teams[0].memberIds.sort()).toEqual(["me", "ml"]);
  });
  it("hard must-roles make a team infeasible instead of silently relaxing", () => {
    const me = person({ id: "me", roles: ["backend"] });
    const f = person({ id: "f", roles: ["frontend"] });
    const strict = needs({ mustRoles: ["backend", "design"], hardRoles: true });
    const r = formTeam(buildContext([me, f], strict, W), ["me"], ["f"], 1);
    expect(r.status).toBe("infeasible");
    expect(r.teams).toEqual([]);
    expect(r.unavailableRoles).toEqual(["design"]);
    const soft = formTeam(buildContext([me, f], { ...strict, hardRoles: false }, W), ["me"], ["f"], 1);
    expect(soft.status).toBe("ok");
    expect(soft.teams[0].roles.find((x) => x.role === "design")?.status).toBe("missing");
  });
  it("hard minimum shared hours are enforced", () => {
    const me = person({ id: "me", availability: HOURS(0, 6) });
    const far = person({ id: "far", availability: HOURS(100, 6) });
    const near = person({ id: "near", availability: HOURS(2, 6), goal: "learn" });
    const ctx = buildContext([me, far, near], needs({ minSharedHours: 3, hardHours: true }), W);
    const r = formTeam(ctx, ["me"], ["far", "near"], 1);
    expect(r.teams.map((t) => t.memberIds.find((m) => m !== "me"))).toEqual(["near"]);
  });
});

describe("J. replace candidate", () => {
  it("re-scores the whole team for each alternative and reports exact deltas", () => {
    const { ctx, pool } = constructed();
    const { current, options } = replaceOptions(ctx, ["me"], ["f1", "f2", "f3"], "f3", pool);
    expect(options.map((o) => o.id).sort()).toEqual(["des", "ml"]);
    for (const o of options) {
      const direct = evaluate(ctx, ["me", "f1", "f2", o.id]);
      expect(o.evaluation.total).toBeCloseTo(direct.total, 12);
      expect(o.delta).toBeCloseTo(direct.total - current.total, 12);
      expect(o.partDeltas.skill).toBeCloseTo(direct.parts.skill - current.parts.skill, 12);
      expect(o.evaluation.memberIds).not.toContain("f3");
      expect(o.delta).toBeGreaterThan(0); // swapping a duplicate frontend for a new role helps the TEAM
    }
    expect(options[0].delta).toBeGreaterThanOrEqual(options[1].delta);
  });
  it("never offers current members and refuses to replace accepted members", () => {
    const { ctx, pool } = constructed();
    const { options } = replaceOptions(ctx, ["me"], ["f1", "ml", "des"], "f1", pool);
    expect(options.map((o) => o.id).sort()).toEqual(["f2", "f3"]);
    expect(() => replaceOptions(ctx, ["me", "f1"], ["ml"], "f1", pool)).toThrow("ACCEPTED_MEMBER");
    expect(() => replaceOptions(ctx, ["me"], ["ml"], "des", pool)).toThrow("NOT_IN_PROPOSAL");
  });
});

describe("K. grow my team", () => {
  const owner = person({ id: "owner", roles: ["pm_pitch"], skills: ["product"], availability: HOURS(20, 12) });
  const writer = person({ id: "writer", roles: ["writing"], skills: ["technical-writing"], availability: HOURS(20, 12) });
  const back = person({ id: "back", roles: ["backend"], skills: ["python", "databases"], availability: HOURS(20, 12) });
  const front = person({ id: "front", roles: ["frontend"], skills: ["react"], availability: HOURS(24, 8) });
  const pm2 = person({ id: "pm2", roles: ["pm_pitch"], skills: ["product"], availability: HOURS(20, 12) });
  const n = needs({ mustRoles: ["backend", "frontend"], preferredRoles: ["ai_ml"], skills: ["python", "react", "databases"], minSharedHours: 6 });
  const ctx = buildContext([owner, writer, back, front, pm2], n, W);

  it("identifies missing required/preferred roles and skills of the existing team", () => {
    const { current } = growRecommendations(ctx, ["owner", "writer"], ["back", "front", "pm2"]);
    expect(current.roles.filter((r) => r.status === "missing").map((r) => `${r.level}:${r.role}`)).toEqual(["must:backend", "must:frontend", "preferred:ai_ml"]);
    expect(current.skillsMissing).toEqual(["python", "react", "databases"]);
  });
  it("ranks candidates by the improvement to the whole team, with transparent reasons", () => {
    const { current, candidates } = growRecommendations(ctx, ["owner", "writer"], ["back", "front", "pm2"]);
    expect(candidates.map((c) => c.id)).toEqual(["back", "front", "pm2"]);
    const [b, f, p] = candidates;
    expect(b.fillsRoles).toEqual([{ role: "backend", level: "must" }]);
    expect(b.addsSkills).toEqual(["python", "databases"]);
    expect(f.fillsRoles).toEqual([{ role: "frontend", level: "must" }]);
    expect(f.after.sharedHours).toBe(8);
    expect(p.fillsRoles).toEqual([]);
    expect(p.addsSkills).toEqual([]);
    for (const c of candidates) {
      expect(c.gain).toBeCloseTo(c.after.total - current.total, 12);
      expect(c.after.memberIds).toHaveLength(3);
    }
    expect(b.gain).toBeGreaterThan(p.gain);
    expect(b.partDeltas.skill).toBeGreaterThan(0);
    expect(p.partDeltas.skill).toBe(0);
  });
});

describe("performance and the beam path", () => {
  const demo = DEMO_PERSONAS.map((p) => person({ id: p.key, name: p.display_name, skills: p.skills, roles: p.roles.slice(0, 2), interests: p.interests.slice(0, 3), availability: p.availability, goal: p.hackathon_goal, style: p.working_style }));
  const pool = demo.filter((p) => p.id !== "jordan").map((p) => p.id);

  it("forms a 4-person team from the 44 demo personas interactively (exhaustive)", () => {
    const ctx = buildContext(demo, needs(), W);
    const t0 = performance.now();
    const r = formTeam(ctx, ["jordan"], pool, 3);
    const ms = performance.now() - t0;
    expect(r.status).toBe("ok");
    expect(r.method).toBe("exhaustive");
    expect(r.teams[0].total).toBeGreaterThanOrEqual(r.baseline!.total - 1e-12);
    expect(ms).toBeLessThan(1500);
  });
  it("falls back to a bounded beam search for large problems and is never worse than the baseline", () => {
    const big = Array.from({ length: 80 }, (_, i) => {
      const src = DEMO_PERSONAS[i % DEMO_PERSONAS.length];
      return person({ id: `b${String(i).padStart(2, "0")}`, skills: src.skills, roles: src.roles, interests: src.interests, availability: src.availability, goal: src.hackathon_goal, style: src.working_style });
    });
    const ctx = buildContext(big, needs({ defaultRoles: defaultRolesFor("hackathon", 7) }), W);
    const ids = big.map((p) => p.id);
    const t0 = performance.now();
    const r = formTeam(ctx, [ids[0]], ids.slice(1), 6);
    const ms = performance.now() - t0;
    expect(r.method).toBe("beam");
    expect(r.teams[0].memberIds).toHaveLength(7);
    expect(r.teams[0].total).toBeGreaterThanOrEqual(r.baseline!.total - 1e-12);
    expect(r.evaluations).toBeLessThan(60_000);
    expect(ms).toBeLessThan(3000);
    expect(JSON.stringify(formTeam(ctx, [ids[0]], ids.slice(1).reverse(), 6))).toBe(JSON.stringify(r));
  });
});
