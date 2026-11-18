/**
 * Plain-language summary of a recommended team, derived ONLY from the engine's
 * TeamView (no extra claims). Weak spots are stated as such: a card is never
 * worded positively when the underlying result is not.
 */
import type { TeamView } from "./view";

export type Tone = "good" | "mixed" | "weak";
export type WhyCard = { key: "skills" | "goals" | "schedule"; tone: Tone; title: string; body: string };

const MATCH_LABEL: Record<TeamView["band"], string> = {
  Strong: "Strong match",
  Good: "Good match",
  Fair: "Fair match",
  Weak: "Weak match",
};

export const matchLabel = (band: TeamView["band"]) => MATCH_LABEL[band];

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

function skillsCard(t: TeamView): WhyCard {
  const covered = t.roles.filter((r) => r.status === "covered").map((r) => r.role);
  const partial = t.roles.filter((r) => r.status === "partial").map((r) => r.role);
  const missing = t.roles.filter((r) => r.status === "missing").map((r) => r.role);
  const skills =
    t.skillsCovered.length + t.skillsMissing.length > 0
      ? ` ${t.skillsCovered.length} of ${t.skillsCovered.length + t.skillsMissing.length} desired skills covered.`
      : "";
  if (t.roles.length === 0) {
    return { key: "skills", tone: "mixed", title: "Skills", body: `Skill areas: ${t.skillAreas.length ? list(t.skillAreas) : "none listed yet"}.${skills}` };
  }
  if (missing.length === 0 && partial.length === 0) {
    return {
      key: "skills",
      tone: t.skillsMissing.length ? "mixed" : "good",
      title: "Balanced skills",
      body: `Covers every target role: ${list(covered)}, each with a dedicated member.${skills}`,
    };
  }
  const parts: string[] = [];
  if (covered.length) parts.push(`Covers ${list(covered)}.`);
  if (partial.length) parts.push(`${list(partial)} only partly covered.`);
  if (missing.length) parts.push(`No one covers ${list(missing)} yet.`);
  return { key: "skills", tone: missing.length ? "weak" : "mixed", title: missing.length ? "Skill gaps" : "Mostly balanced skills", body: parts.join(" ") + skills };
}

function goalsCard(t: TeamView): WhyCard {
  const goals = t.members.map((m) => m.goal).filter((g): g is string => !!g);
  const n = t.members.length;
  if (n < 2 || goals.length === 0) {
    return { key: "goals", tone: "mixed", title: "Goals", body: "Not enough members have set a goal to compare." };
  }
  const counts = new Map<string, number>();
  for (const g of goals) counts.set(g, (counts.get(g) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [top, count] = ranked[0];
  if (count === n) return { key: "goals", tone: "good", title: "Shared goals", body: `Everyone chose “${top}”.` };
  const rest = ranked.slice(1).map(([g, c]) => `${c} “${g}”`);
  const unset = n - goals.length;
  const others = [...rest, ...(unset ? [`${unset} not set`] : [])].join(", ");
  if (count > n / 2) return { key: "goals", tone: "mixed", title: "Mostly shared goals", body: `${count} of ${n} chose “${top}”; ${others}.` };
  return { key: "goals", tone: "weak", title: "Different goals", body: `Only ${count} of ${n} share a goal (“${top}”); ${others}. Agree on what you're aiming for early.` };
}

function scheduleCard(t: TeamView): WhyCard {
  const { sharedHours: h, targetHours: target, windows } = t.schedule;
  const best = windows.length ? ` Best overlap: ${windows.slice(0, 2).join(", ")}.` : "";
  if (h === 0) return { key: "schedule", tone: "weak", title: "No common free time", body: `There's no hour in the week when everyone is free (target ${target} h).` };
  if (h >= target) {
    return { key: "schedule", tone: "good", title: "Compatible schedules", body: `${h} h/week when everyone is free (target ${target}).${best}` };
  }
  return { key: "schedule", tone: "weak", title: "Limited shared time", body: `Only ${h} h/week when everyone is free (target ${target}).${best}` };
}

export function whyThisTeam(t: TeamView): WhyCard[] {
  return [skillsCard(t), goalsCard(t), scheduleCard(t)];
}

/** One sentence under the match label. Positive wording only for what actually holds. */
export function teamSummary(t: TeamView): string {
  const allRoles = t.roles.length > 0 && t.roles.every((r) => r.status === "covered");
  const enoughTime = t.schedule.sharedHours > 0 && t.schedule.sharedHours >= t.schedule.targetHours;
  if (allRoles && enoughTime && t.skillsMissing.length === 0) return "A balanced team with complementary skills and compatible schedules.";
  const covered = t.roles.filter((r) => r.status === "covered").length;
  const roles = allRoles ? "Covers every target role" : t.roles.length ? `Covers ${covered} of ${t.roles.length} target roles` : "Complementary skill areas";
  const time = enoughTime
    ? `${t.schedule.sharedHours} h/week of shared free time`
    : t.schedule.sharedHours === 0
      ? "no common free time yet"
      : `only ${t.schedule.sharedHours} h/week of shared free time`;
  return `${roles}, ${enoughTime ? "with" : "but"} ${time}.`;
}

/** The short, data-grounded line on a member card (the role is shown separately). */
export function memberHighlight(reasons: string[]): string | null {
  return reasons.find((r) => !/^(Covers|Flexible)/.test(r)) ?? reasons[0] ?? null;
}

export type MatchTone = "positive" | "neutral" | "caution" | "low";
export type MatchPresentation = { label: string; tone: MatchTone; tradeOff: string | null };

/**
 * How to present the engine's band without contradicting the explanation cards.
 * The label is always the score-derived band. A Strong/Good team is shown as
 * positive only when no card reports a weakness; otherwise it gets a neutral
 * treatment and a short note on why the overall score is still high.
 */
export function matchPresentation(t: TeamView): MatchPresentation {
  const label = matchLabel(t.band);
  if (t.band === "Fair") return { label, tone: "caution", tradeOff: null };
  if (t.band === "Weak") return { label, tone: "low", tradeOff: null };
  const cards = whyThisTeam(t);
  const weak = cards.filter((c) => c.tone === "weak");
  if (weak.length === 0) return { label, tone: "positive", tradeOff: null };
  // Never credit a dimension whose explanation card isn't positive (e.g. a high skill score with a missing role).
  const CARD_OF: Partial<Record<string, WhyCard["key"]>> = { skill: "skills", goal: "goals", schedule: "schedule" };
  const notGood = new Set(cards.filter((c) => c.tone !== "good").map((c) => c.key));
  const helped = [...t.dimensions]
    .filter((d) => d.score >= 0.75 && !(CARD_OF[d.key] && notGood.has(CARD_OF[d.key]!)))
    .sort((a, b) => b.score - a.score || b.weight - a.weight)
    .slice(0, 2)
    .map((d) => d.label.toLowerCase());
  const issues = list(weak.map((c) => c.title.toLowerCase()));
  const why = helped.length
    ? `The overall score is still ${t.band.toLowerCase()} because this team does well on ${list(helped)}`
    : `The overall score balances all five factors`;
  return { label, tone: "neutral", tradeOff: `${why}, but it has trade-offs to weigh before inviting: ${issues}.` };
}
