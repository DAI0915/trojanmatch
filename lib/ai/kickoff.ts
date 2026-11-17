import "server-only";
import { z } from "zod";
import { GOALS, INTERESTS, roleLabel, skillLabel, interestLabel, type SpaceType } from "@/lib/taxonomy";
import type { Workspace } from "@/lib/workspace";
import { GeminiError, generateJson } from "./gemini";

/** What the UI renders. Member references are ids from the team (validated). */
export const kickoffContentSchema = z.object({
  goal_summary: z.string().trim().min(1).max(500),
  project_ideas: z
    .array(z.object({
      title: z.string().trim().min(1).max(80),
      pitch: z.string().trim().min(1).max(400),
      why_this_team: z.string().trim().max(400),
      tech_approach: z.string().trim().max(400),
    }))
    .min(1).max(3),
  strengths: z.array(z.string().trim().min(1).max(240)).max(5),
  gaps: z.array(z.string().trim().min(1).max(240)).max(5),
  roles: z.array(z.object({
    member_id: z.string(),
    role: z.string().trim().min(1).max(60),
    responsibilities: z.string().trim().max(300),
  })).max(10),
  first_meeting_agenda: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
  first_actions: z.array(z.object({ action: z.string().trim().min(1).max(240), owner_id: z.string().nullable() })).min(1).max(5),
  challenges: z.array(z.object({ risk: z.string().trim().min(1).max(240), mitigation: z.string().trim().max(240) })).max(4),
});
export type KickoffContent = z.infer<typeof kickoffContentSchema>;

export type KickoffBrief = {
  version: 1;
  source: "llm" | "template";
  model: string | null;
  /** Why the template was used (shown honestly in the UI). */
  fallback_reason: null | "not_configured" | "timeout" | "http" | "blocked" | "invalid" | "demo_limit";
  content: KickoffContent;
};

/** JSON Schema for Gemini structured output (mirrors kickoffContentSchema). */
const str = { type: "string" };
const KICKOFF_JSON_SCHEMA = {
  type: "object",
  properties: {
    goal_summary: str,
    project_ideas: {
      type: "array", minItems: 2, maxItems: 3,
      items: { type: "object", properties: { title: str, pitch: str, why_this_team: str, tech_approach: str }, required: ["title", "pitch", "why_this_team", "tech_approach"] },
    },
    strengths: { type: "array", items: str, maxItems: 5 },
    gaps: { type: "array", items: str, maxItems: 5 },
    roles: {
      type: "array",
      items: { type: "object", properties: { member_id: str, role: str, responsibilities: str }, required: ["member_id", "role", "responsibilities"] },
    },
    first_meeting_agenda: { type: "array", items: str, minItems: 3, maxItems: 6 },
    first_actions: {
      type: "array", minItems: 3, maxItems: 3,
      items: { type: "object", properties: { action: str, owner_id: { type: ["string", "null"] } }, required: ["action", "owner_id"] },
    },
    challenges: {
      type: "array", maxItems: 4,
      items: { type: "object", properties: { risk: str, mitigation: str }, required: ["risk", "mitigation"] },
    },
  },
  required: ["goal_summary", "project_ideas", "strengths", "gaps", "roles", "first_meeting_agenda", "first_actions", "challenges"],
};

const goalText = (type: SpaceType, id: string | null) => GOALS[type].find((g) => g.id === id)?.label ?? null;

/**
 * The ONLY data sent to the model: this team's accepted members' consented
 * matching features in this Space, the team's requirements, and the
 * deterministic fit facts. No emails, bios, chat history, other students,
 * other teams or other Spaces.
 */
export function kickoffFacts(w: Workspace) {
  return {
    space: { title: w.space.title, type: w.space.type },
    team: {
      name: w.team.name,
      description: w.team.description,
      size: w.members.length,
      target_size: w.team.targetSize,
      requirements: {
        must_roles: (w.team.requirements.must_roles ?? []).map(roleLabel),
        preferred_roles: (w.team.requirements.preferred_roles ?? []).map(roleLabel),
        skills: (w.team.requirements.skills ?? []).map(skillLabel),
        topics: (w.team.requirements.topics ?? []).map(interestLabel),
        note: w.team.requirements.note ?? null,
      },
    },
    members: w.members.map((m) => ({
      id: m.id,
      name: m.name,
      roles: m.roles,
      skills: m.skillIds.map(skillLabel),
      interests: m.interestIds.map(interestLabel),
      goal: goalText(w.space.type, m.goal),
      experience: m.experience,
    })),
    // Deterministic TrojanMatch results — reproduced verbatim, never re-scored by the model.
    matching: {
      team_fit_score: w.fit.score,
      team_fit_band: w.fit.band,
      suggested_role_assignment: w.fit.members.map((m) => ({ member_id: m.id, role: m.role })),
      role_coverage: w.fit.roles.map((r) => ({ role: r.role, level: r.level, status: r.status })),
      skills_covered: w.fit.skillsCovered,
      skills_missing: w.fit.skillsMissing,
      shared_hours_per_week: w.fit.schedule.sharedHours,
      shared_windows: w.fit.schedule.windows,
      known_gaps: w.fit.gaps,
    },
  };
}

const SYSTEM = [
  "You are TrojanMatch's Team Kickoff Assistant for a newly formed student team (hackathon or course project).",
  "Use ONLY the JSON facts provided. Do not invent members, skills, availability, scores or people outside the team.",
  "The matching section is computed by a deterministic algorithm: do not change, re-estimate or contradict the fit score, role coverage or shared hours. You may quote them.",
  "Role assignments are SUGGESTIONS the members must agree on; phrase them that way. Reference members only by their exact member id in member_id/owner_id fields.",
  "Ideas must fit the members' actual skills and interests and be buildable in the event time frame. Be concrete and concise.",
  "Plain text only in every string: no Markdown, no HTML, no links.",
  "Output: goal_summary; 2–3 project_ideas (title, pitch, why_this_team, tech_approach); strengths; gaps; roles (one per member);",
  "first_meeting_agenda (3–6 items); exactly 3 first_actions with an owner_id from the team (or null); up to 4 challenges with mitigations.",
].join("\n");

/** Drop references to anyone who is not an accepted member of this team. */
function sanitize(c: KickoffContent, memberIds: Set<string>): KickoffContent {
  const seen = new Set<string>();
  return {
    ...c,
    roles: c.roles.filter((r) => memberIds.has(r.member_id) && !seen.has(r.member_id) && seen.add(r.member_id)),
    first_actions: c.first_actions.map((a) => ({ ...a, owner_id: a.owner_id && memberIds.has(a.owner_id) ? a.owner_id : null })),
  };
}

/** Deterministic, always-available kickoff built from the same facts. */
export function templateKickoff(w: Workspace): KickoffContent {
  const facts = kickoffFacts(w);
  const counts = new Map<string, number>();
  for (const m of w.members) for (const t of m.interestIds) counts.set(t, (counts.get(t) ?? 0) + 1);
  const reqTopics = w.team.requirements.topics ?? [];
  const topics = [...new Set([...reqTopics, ...[...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([t]) => t)])]
    .filter((t) => INTERESTS.some((i) => i.id === t))
    .slice(0, 3);
  const goals = w.members.map((m) => goalText(w.space.type, m.goal)).filter(Boolean) as string[];
  const mainGoal = goals.sort((a, b) => goals.filter((g) => g === b).length - goals.filter((g) => g === a).length)[0] ?? "Ship a working project";
  const skills = [...new Set(w.members.flatMap((m) => m.skillIds))].slice(0, 6).map(skillLabel);
  const byRole = (needle: string) => w.fit.members.find((m) => (m.role ?? "").includes(needle))?.id ?? null;
  const owner = w.members.find((m) => m.owner)?.id ?? w.members[0]?.id ?? null;

  const ideas = (topics.length ? topics : ["productivity"]).map((t) => {
    const label = interestLabel(t);
    return {
      title: `${label} assistant`,
      pitch: `A focused web app that helps students with a real ${label.toLowerCase()} problem, demoable end to end in ${w.space.type === "hackathon" ? "the hackathon" : "the project timeline"}.`,
      why_this_team: `${counts.get(t) ?? 0} of ${w.members.length} members list ${label} as an interest, and the team covers ${facts.matching.skills_covered.slice(0, 3).join(", ") || skills.slice(0, 3).join(", ")}.`,
      tech_approach: `Use the team's existing stack (${skills.slice(0, 4).join(", ") || "familiar tools"}); start with one core user flow and a deployed demo.`,
    };
  });

  return {
    goal_summary: `${mainGoal}: ${w.team.name} (${w.members.length} members) in ${w.space.title}. Team fit ${w.fit.band.toLowerCase()} (${w.fit.score.toFixed(2)}) with ${w.fit.schedule.sharedHours} shared hours per week.`,
    project_ideas: ideas,
    strengths: [
      ...w.fit.roles.filter((r) => r.status === "covered").slice(0, 3).map((r) => `${r.role} is covered${r.by ? ` (${r.by})` : ""}.`),
      ...(w.fit.skillsCovered.length ? [`Desired skills covered: ${w.fit.skillsCovered.join(", ")}.`] : []),
    ].slice(0, 5),
    gaps: w.fit.gaps.slice(0, 5),
    roles: w.fit.members.map((m) => ({
      member_id: m.id,
      role: m.role ?? m.roles[0] ?? "Flexible",
      responsibilities: `Suggested: lead ${(m.role ?? m.roles[0] ?? "flexible").toLowerCase()} work; confirm or swap with the team in the first meeting.`,
    })),
    first_meeting_agenda: [
      "Introductions: goals, strengths and what each person wants to learn",
      "Pick one project idea and write a one-sentence problem statement",
      "Agree on suggested roles (anyone can swap)",
      w.fit.schedule.windows.length ? `Lock regular work sessions: ${w.fit.schedule.windows.slice(0, 2).join("; ")}` : "Find a regular weekly work time",
      "Define the demo you want to show at the end",
    ],
    first_actions: [
      { action: "Create the shared repo, task board and a README with the problem statement", owner_id: byRole("Backend") ?? owner },
      { action: "Sketch the core user flow (3–5 screens) and share it in chat", owner_id: byRole("Design") ?? byRole("Frontend") ?? owner },
      { action: "List the data/APIs or models you need and test the riskiest one first", owner_id: byRole("AI") ?? byRole("Data") ?? owner },
    ],
    challenges: [
      ...(w.fit.schedule.sharedHours < 6 ? [{ risk: `Only ${w.fit.schedule.sharedHours} shared hours per week`, mitigation: "Agree on async updates in chat and short daily check-ins." }] : []),
      ...(w.fit.skillsMissing.length ? [{ risk: `Missing skills: ${w.fit.skillsMissing.join(", ")}`, mitigation: "Scope the idea around covered skills or pair-learn early." }] : []),
      { risk: "Scope creep", mitigation: "Freeze the feature list after the first meeting; demo one polished flow." },
    ].slice(0, 4),
  };
}

/** Gemini when configured and valid; otherwise the deterministic template. */
export async function generateKickoff(w: Workspace): Promise<KickoffBrief> {
  const ids = new Set(w.members.map((m) => m.id));
  try {
    const { data, model } = await generateJson({
      system: SYSTEM,
      user: `Team facts (JSON):\n${JSON.stringify(kickoffFacts(w))}`,
      schema: KICKOFF_JSON_SCHEMA,
    });
    const parsed = kickoffContentSchema.safeParse(data);
    if (!parsed.success) throw new GeminiError("invalid", "Gemini output did not match the kickoff schema.");
    return { version: 1, source: "llm", model, fallback_reason: null, content: sanitize(parsed.data, ids) };
  } catch (e) {
    const reason = e instanceof GeminiError ? e.kind : "http";
    if (reason !== "not_configured") console.error("[kickoff] falling back to template:", reason);
    return templateBrief(w, reason);
  }
}

/** Deterministic template kickoff (no model call), labeled with why it was used. */
export function templateBrief(w: Workspace, reason: NonNullable<KickoffBrief["fallback_reason"]>): KickoffBrief {
  const ids = new Set(w.members.map((m) => m.id));
  return { version: 1, source: "template", model: null, fallback_reason: reason, content: sanitize(templateKickoff(w), ids) };
}
