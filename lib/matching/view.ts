/**
 * Turns engine results into the minimal, human-readable view sent to the browser.
 * No availability arrays, bios, emails or other Spaces' data leave the server.
 */
import { DAYS, utcToLocalHours } from "@/lib/availability";
import { goalLabel, interestLabel, roleLabel, skillLabel, type SpaceType } from "@/lib/taxonomy";
import { PART_KEYS, band, type Context, type Evaluation, type PartKey, type Parts, type Person } from "./engine";

export type MemberKind = "you" | "member" | "candidate";
export type MemberView = {
  id: string;
  name: string;
  synthetic: boolean;
  kind: MemberKind;
  role: string | null;
  roles: string[];
  skills: string[];
  goal: string | null;
  experience: string | null;
  reasons: string[];
};
export type DimensionView = { key: PartKey; label: string; score: number; weight: number; summary: string };
export type RoleView = { role: string; level: "must" | "preferred" | "default"; status: "covered" | "partial" | "missing"; by: string | null };
export type TeamView = {
  key: string;
  score: number;
  band: ReturnType<typeof band>;
  members: MemberView[];
  dimensions: DimensionView[];
  roles: RoleView[];
  usingDefaultRoles: boolean;
  skillsCovered: string[];
  skillsMissing: string[];
  skillAreas: string[];
  gaps: string[];
  schedule: { sharedHours: number; targetHours: number; windows: string[]; timeZone: string };
};

export const DIMENSION_LABEL: Record<PartKey, string> = {
  skill: "Roles & skills",
  goal: "Goal alignment",
  interest: "Shared interests",
  schedule: "Availability overlap",
  style: "Working style",
};

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 || h === 24 ? "a" : "p"}`;

/** "Sat 10a–6p, Sun 12p–4p" in the viewer's time zone. */
export function describeWindows(utcHours: number[], timeZone: string, max = 4): string[] {
  const local = utcToLocalHours(utcHours, timeZone);
  const out: { day: number; start: number; end: number }[] = [];
  for (const h of local) {
    const day = Math.floor(h / 24);
    const hour = h % 24;
    const last = out[out.length - 1];
    if (last && last.day === day && last.end === hour) last.end = hour + 1;
    else out.push({ day, start: hour, end: hour + 1 });
  }
  return out
    .sort((a, b) => b.end - b.start - (a.end - a.start) || a.day - b.day || a.start - b.start)
    .slice(0, max)
    .sort((a, b) => a.day - b.day || a.start - b.start)
    .map((w) => `${DAYS[w.day]} ${hourLabel(w.start)}–${hourLabel(w.end === 24 ? 24 : w.end)}`);
}

const firstName = (n: string) => n.split(/\s+/)[0];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function memberReasons(ctx: Context, e: Evaluation, p: Person, viewerId: string): string[] {
  const out: string[] = [];
  const assigned = e.assignment[p.id];
  const target = ctx.targets.find((t) => t.role === assigned);
  if (assigned && target) {
    const level = target.level === "must" ? " (required)" : target.level === "preferred" ? " (preferred)" : "";
    out.push(p.roles.includes(assigned) ? `Covers ${roleLabel(assigned)}${level}` : `Flexible: can step into ${roleLabel(assigned)}${level}`);
  }
  const wanted = ctx.needs.skills.filter((s) => p.skills.includes(s));
  if (wanted.length) out.push(`Brings ${list(wanted.slice(0, 3).map(skillLabel))}`);
  else if (p.skills.length) out.push(`Strengths: ${list(p.skills.slice(0, 3).map(skillLabel))}`);
  const others = e.memberIds.filter((id) => id !== p.id).map((id) => ctx.byId.get(id)!.p);
  if (p.goal && others.length) {
    const same = others.filter((o) => o.goal === p.goal).length;
    if (same === others.length) out.push(`Same goal as everyone else: ${goalLabel(ctx.needs.spaceType, p.goal)}`);
    else if (same > 0) out.push(`Shares the goal “${goalLabel(ctx.needs.spaceType, p.goal)}” with ${same} teammate${same === 1 ? "" : "s"}`);
  }
  const shared = e.sharedTopics.filter((t) => p.interests.includes(t.tag)).map((t) => interestLabel(t.tag));
  if (shared.length) out.push(`Shared interests: ${list(shared.slice(0, 3))}`);
  if (p.id === viewerId) return out.slice(0, 2);
  return out.slice(0, 4);
}

function dimensionSummary(ctx: Context, e: Evaluation, key: PartKey): string {
  const type: SpaceType = ctx.needs.spaceType;
  const n = e.memberIds.length;
  switch (key) {
    case "skill": {
      const covered = e.roles.filter((r) => r.status === "covered").length;
      const missing = e.roles.filter((r) => r.status === "missing").map((r) => roleLabel(r.role));
      const base = `${covered} of ${e.roles.length} target roles have a dedicated member`;
      const skills = ctx.needs.skills.length
        ? `; ${e.skillsCovered.length} of ${ctx.needs.skills.length} desired skills covered`
        : `; skills span ${e.skillGroupsCovered.length} of 5 areas`;
      return base + skills + (missing.length ? `. Missing: ${list(missing)}` : ".");
    }
    case "goal": {
      if (n < 2) return "Needs at least two members to compare goals.";
      const entries = Object.entries(e.goalCounts).sort((a, b) => b[1] - a[1]);
      if (entries.length === 0) return "No goals set yet.";
      const [top, count] = entries[0];
      const label = goalLabel(type, top) ?? top;
      return count === n ? `Everyone chose “${label}”.` : `${count} of ${n} chose “${label}”; ${entries.slice(1).map(([g, c]) => `${c} “${goalLabel(type, g) ?? g}”`).join(", ") || "others not set"}.`;
    }
    case "interest":
      if (n < 2) return "Needs at least two members to compare interests.";
      return e.sharedTopics.length
        ? `Shared themes: ${e.sharedTopics.map((t) => `${interestLabel(t.tag)} (${t.count})`).join(", ")}.`
        : "No topic is shared by two or more members.";
    case "schedule":
      return `${e.sharedHours} h/week when everyone is free (target ${e.targetHours}).`;
    case "style":
      return n < 2 ? "Needs at least two members to compare working styles." : e.parts.style >= 0.75 ? "Similar collaboration, planning and check-in preferences." : e.parts.style >= 0.5 ? "Mostly compatible working styles, with some differences." : "Noticeably different working styles: agree on norms early.";
  }
}

export function toTeamView(ctx: Context, e: Evaluation, fixedIds: string[], viewerId: string, timeZone: string): TeamView {
  const type = ctx.needs.spaceType;
  const order = [...e.memberIds].sort((a, b) => {
    const rank = (id: string) => (id === viewerId ? 0 : fixedIds.includes(id) ? 1 : 2);
    return rank(a) - rank(b) || (ctx.byId.get(a)!.p.name < ctx.byId.get(b)!.p.name ? -1 : 1);
  });
  const nameOf = (id: string | null) => (id ? (id === viewerId ? "You" : firstName(ctx.byId.get(id)!.p.name)) : null);

  const gaps: string[] = [];
  const missingMust = e.roles.filter((r) => r.status === "missing" && r.level === "must").map((r) => roleLabel(r.role));
  const missingOther = e.roles.filter((r) => r.status === "missing" && r.level !== "must").map((r) => roleLabel(r.role));
  if (missingMust.length) gaps.push(`No one covers the required role${missingMust.length > 1 ? "s" : ""} ${list(missingMust)}.`);
  if (missingOther.length) gaps.push(`No one covers ${list(missingOther)}.`);
  if (e.skillsMissing.length) gaps.push(`Desired skills not covered: ${list(e.skillsMissing.map(skillLabel))}.`);
  if (e.sharedHours < e.targetHours) gaps.push(`Only ${e.sharedHours} h/week when everyone is free (target ${e.targetHours}).`);

  return {
    key: [...e.memberIds].sort().join("|"),
    score: Math.round(e.total * 1000) / 1000,
    band: band(e.total),
    members: order.map((id) => {
      const p = ctx.byId.get(id)!.p;
      const assigned = e.assignment[id];
      return {
        id,
        name: p.name,
        synthetic: p.synthetic,
        kind: id === viewerId ? "you" : fixedIds.includes(id) ? "member" : "candidate",
        role: assigned ? (p.roles.includes(assigned) ? roleLabel(assigned) : `Flexible → ${roleLabel(assigned)}`) : null,
        roles: p.roles.map(roleLabel),
        skills: p.skills.slice(0, 5).map(skillLabel),
        goal: goalLabel(type, p.goal),
        experience: p.experience,
        reasons: memberReasons(ctx, e, p, viewerId),
      };
    }),
    dimensions: PART_KEYS.map((key) => ({
      key,
      label: DIMENSION_LABEL[key],
      score: Math.round(e.parts[key] * 100) / 100,
      weight: ctx.weights[key],
      summary: dimensionSummary(ctx, e, key),
    })),
    roles: e.roles.map((r) => ({ role: roleLabel(r.role), level: r.level, status: r.status, by: nameOf(r.by) })),
    usingDefaultRoles: e.usingDefaultRoles,
    skillsCovered: e.skillsCovered.map(skillLabel),
    skillsMissing: e.skillsMissing.map(skillLabel),
    skillAreas: e.skillGroupsCovered,
    gaps,
    schedule: { sharedHours: e.sharedHours, targetHours: e.targetHours, windows: describeWindows(e.sharedHourList, timeZone), timeZone },
  };
}

export function roundParts(p: Parts): Parts {
  const r = (x: number) => Math.round(x * 100) / 100;
  return { skill: r(p.skill), goal: r(p.goal), interest: r(p.interest), schedule: r(p.schedule), style: r(p.style) };
}
