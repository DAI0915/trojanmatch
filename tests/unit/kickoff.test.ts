import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateKickoff, kickoffFacts, templateKickoff } from "@/lib/ai/kickoff";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini";
import { PRESETS, buildContext, defaultRolesFor, evaluate, type Person } from "@/lib/matching/engine";
import { toTeamView } from "@/lib/matching/view";
import type { Workspace } from "@/lib/workspace";
import { config } from "dotenv";

const person = (id: string, name: string, roles: string[], skills: string[], interests: string[]): Person => ({
  id, name, synthetic: true, skills, roles, interests, experience: "intermediate", style: {}, availability: [20, 21, 22, 23, 44, 45], goal: "build",
});
const people = [
  person("u1", "Jordan Lee", ["backend", "frontend"], ["typescript", "react"], ["education", "llm-agents"]),
  person("u2", "Maya Chen", ["design", "frontend"], ["figma", "ui-ux"], ["education", "accessibility"]),
  person("u3", "Priya Raman", ["ai_ml", "research"], ["python", "llm"], ["llm-agents", "education"]),
];

function workspace(): Workspace {
  const needs = { spaceType: "hackathon" as const, mustRoles: [], preferredRoles: [], defaultRoles: defaultRolesFor("hackathon", 4), skills: [], topics: [], goal: null, minSharedHours: null, hardRoles: false, hardHours: false };
  const ctx = buildContext(people, needs, PRESETS.balanced.weights);
  const fit = toTeamView(ctx, evaluate(ctx, people.map((p) => p.id)), people.map((p) => p.id), "", "America/Los_Angeles");
  return {
    team: { id: "t1", name: "Trojan Builders", description: null, status: "active", targetSize: 4, requirements: {}, activationMode: "auto" },
    space: { id: "s1", slug: "s", title: "TreeHacks 2027", type: "hackathon" },
    members: people.map((p, i) => ({ id: p.id, name: p.name, synthetic: true, owner: i === 0, roles: [], skills: [], skillIds: p.skills, interestIds: p.interests, goal: p.goal, experience: p.experience })),
    fit, messages: [], kickoff: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("kickoff grounding", () => {
  it("facts contain only this team's members and the deterministic fit — no chat, bios or emails", () => {
    const f = kickoffFacts(workspace());
    expect(f.members.map((m) => m.id)).toEqual(["u1", "u2", "u3"]);
    expect(f.matching.team_fit_score).toBe(workspace().fit.score);
    const json = JSON.stringify(f);
    expect(json).not.toMatch(/bio|email|messages|@/i);
  });

  it("template kickoff is deterministic and references members only", () => {
    const a = templateKickoff(workspace());
    expect(templateKickoff(workspace())).toEqual(a);
    expect(a.project_ideas.length).toBeGreaterThan(0);
    expect(a.first_actions).toHaveLength(3);
    expect(a.roles.map((r) => r.member_id).sort()).toEqual(["u1", "u2", "u3"]);
    expect(a.goal_summary).toContain(workspace().fit.score.toFixed(2));
  });
});

describe("generateKickoff", () => {
  it("without GEMINI_API_KEY uses the template and says why", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const b = await generateKickoff(workspace());
    expect(b).toMatchObject({ source: "template", fallback_reason: "not_configured", model: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  const llm = {
    goal_summary: "Ship an AI study buddy.",
    project_ideas: [{ title: "StudyPilot", pitch: "p", why_this_team: "w", tech_approach: "t" }, { title: "B", pitch: "p", why_this_team: "w", tech_approach: "t" }],
    strengths: ["s"], gaps: ["g"],
    roles: [{ member_id: "u1", role: "Backend", responsibilities: "r" }, { member_id: "intruder", role: "X", responsibilities: "r" }],
    first_meeting_agenda: ["a", "b", "c"],
    first_actions: [{ action: "x", owner_id: "u2" }, { action: "y", owner_id: "stranger" }, { action: "z", owner_id: null }],
    challenges: [{ risk: "r", mitigation: "m" }],
  };
  const okResponse = (payload: unknown) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });

  it("calls Gemini server-side with the key in a header and drops non-member references", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    vi.stubEnv("GEMINI_MODEL", "");
    const fetchSpy = vi.fn().mockResolvedValue(okResponse(llm));
    vi.stubGlobal("fetch", fetchSpy);
    const b = await generateKickoff(workspace());
    expect(b.source).toBe("llm");
    expect(b.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(b.content.roles.map((r) => r.member_id)).toEqual(["u1"]);
    expect(b.content.first_actions.map((a) => a.owner_id)).toEqual(["u2", null, null]);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain(`/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
    expect(String(url)).not.toContain("test-key-not-real");
    expect((init as RequestInit).headers).toMatchObject({ "x-goog-api-key": "test-key-not-real" });
    expect(String((init as RequestInit).body)).not.toContain("test-key-not-real");
  });

  it("invalid model output or HTTP errors fall back to the template", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-real");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ nope: true })));
    expect(await generateKickoff(workspace())).toMatchObject({ source: "template", fallback_reason: "invalid" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("err", { status: 503 })));
    expect(await generateKickoff(workspace())).toMatchObject({ source: "template", fallback_reason: "http" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("t"), { name: "TimeoutError" })));
    expect(await generateKickoff(workspace())).toMatchObject({ source: "template", fallback_reason: "timeout" });
  });
});

// Opt-in REAL Gemini call (never in CI by default): LIVE_GEMINI=1 npx vitest run tests/unit/kickoff.test.ts
describe.skipIf(!process.env.LIVE_GEMINI)("live Gemini kickoff", () => {
  it("returns a schema-valid, member-grounded kickoff from the real API", async () => {
    config({ path: ".env.local", quiet: true });
    const t0 = Date.now();
    const b = await generateKickoff(workspace());
    console.log(`[live] source=${b.source} model=${b.model} fallback=${b.fallback_reason} ms=${Date.now() - t0} ideas=${b.content.project_ideas.map((i) => i.title).join(" | ")}`);
    expect(b.source).toBe("llm");
    expect(b.content.roles.every((r) => ["u1", "u2", "u3"].includes(r.member_id))).toBe(true);
  }, 60_000);
});
