import { describe, expect, it } from "vitest";
import type { MemberView, TeamView } from "@/lib/matching/view";
import { matchLabel, matchPresentation, memberHighlight, teamSummary, whyThisTeam } from "@/lib/matching/why";

const member = (name: string, goal: string | null, kind: MemberView["kind"] = "candidate"): MemberView => ({
  id: name, name, synthetic: true, kind, role: null, roles: [], skills: [], goal, experience: null, reasons: [],
});

function team(over: Partial<TeamView> = {}): TeamView {
  return {
    key: "k",
    score: 0.9,
    band: "Strong",
    members: [member("A", "Win", "you"), member("B", "Win"), member("C", "Win"), member("D", "Win")],
    dimensions: [],
    roles: [
      { role: "Backend", level: "default", status: "covered", by: "You" },
      { role: "Frontend", level: "default", status: "covered", by: "B" },
    ],
    usingDefaultRoles: true,
    skillsCovered: [],
    skillsMissing: [],
    skillAreas: [],
    gaps: [],
    schedule: { sharedHours: 20, targetHours: 6, windows: ["Mon 6p–11p"], timeZone: "America/Los_Angeles" },
    ...over,
  };
}

const byKey = (t: TeamView) => Object.fromEntries(whyThisTeam(t).map((c) => [c.key, c]));

describe("whyThisTeam", () => {
  it("is positive only when the result supports it", () => {
    const c = byKey(team());
    expect(c.skills).toMatchObject({ tone: "good", title: "Balanced skills" });
    expect(c.skills.body).toContain("Backend and Frontend");
    expect(c.goals).toMatchObject({ tone: "good", title: "Shared goals", body: "Everyone chose “Win”." });
    expect(c.schedule).toMatchObject({ tone: "good", title: "Compatible schedules" });
    expect(c.schedule.body).toContain("20 h/week");
    expect(teamSummary(team())).toBe("A balanced team with complementary skills and compatible schedules.");
  });

  it("names missing roles, split goals and short schedules as weaknesses", () => {
    const t = team({
      roles: [
        { role: "Backend", level: "must", status: "covered", by: "You" },
        { role: "Design", level: "must", status: "missing", by: null },
      ],
      members: [member("A", "Win", "you"), member("B", "Learn"), member("C", "Ship"), member("D", null)],
      schedule: { sharedHours: 3, targetHours: 6, windows: [], timeZone: "UTC" },
    });
    const c = byKey(t);
    expect(c.skills).toMatchObject({ tone: "weak", title: "Skill gaps" });
    expect(c.skills.body).toContain("No one covers Design yet.");
    expect(c.goals.tone).toBe("weak");
    expect(c.goals.title).toBe("Different goals");
    expect(c.schedule).toMatchObject({ tone: "weak", title: "Limited shared time" });
    expect(c.schedule.body).toContain("Only 3 h/week");
    const summary = teamSummary(t);
    expect(summary).toBe("Covers 1 of 2 target roles, but only 3 h/week of shared free time.");
    expect(summary).not.toMatch(/balanced|compatible/i);
  });

  it("handles no common time and a majority goal", () => {
    const t = team({
      members: [member("A", "Win", "you"), member("B", "Win"), member("C", "Win"), member("D", "Learn")],
      schedule: { sharedHours: 0, targetHours: 6, windows: [], timeZone: "UTC" },
    });
    const c = byKey(t);
    expect(c.goals).toMatchObject({ tone: "mixed", title: "Mostly shared goals", body: "3 of 4 chose “Win”; 1 “Learn”." });
    expect(c.schedule).toMatchObject({ tone: "weak", title: "No common free time" });
    expect(teamSummary(t)).toBe("Covers every target role, but no common free time yet.");
  });

  it("does not call skills balanced when desired skills are missing", () => {
    const t = team({ skillsCovered: ["Python"], skillsMissing: ["Figma"] });
    expect(byKey(t).skills.tone).toBe("mixed");
    expect(teamSummary(t)).not.toContain("balanced");
  });
});

describe("labels", () => {
  it("maps bands to plain match labels", () => {
    expect(matchLabel("Strong")).toBe("Strong match");
    expect(matchLabel("Weak")).toBe("Weak match");
  });
  it("prefers a strength over the role line already shown on the card", () => {
    expect(memberHighlight(["Covers Backend", "Brings Python"])).toBe("Brings Python");
    expect(memberHighlight(["Covers Backend"])).toBe("Covers Backend");
    expect(memberHighlight([])).toBeNull();
  });
});

describe("matchPresentation", () => {
  const dims = (scores: Record<string, number>): TeamView["dimensions"] =>
    Object.entries(scores).map(([key, score]) => ({ key: key as TeamView["dimensions"][number]["key"], label: key === "style" ? "Working style" : key === "interest" ? "Shared interests" : key, score, weight: 0.2, summary: "" }));

  it("keeps a positive treatment when nothing is weak", () => {
    expect(matchPresentation(team())).toEqual({ label: "Strong match", tone: "positive", tradeOff: null });
    expect(matchPresentation(team({ band: "Good" })).tone).toBe("positive");
  });

  it("keeps the Good label but goes neutral and explains trade-offs when cards report weaknesses", () => {
    const t = team({
      band: "Good",
      roles: [{ role: "AI / ML", level: "default", status: "missing", by: null }, { role: "Backend", level: "default", status: "covered", by: "You" }],
      members: [member("A", "Win", "you"), member("B", "Learn"), member("C", "Ship"), member("D", null)],
      schedule: { sharedHours: 2, targetHours: 4, windows: [], timeZone: "UTC" },
      dimensions: dims({ style: 0.96, interest: 0.8, skill: 0.5 }),
    });
    const p = matchPresentation(t);
    expect(p.label).toBe("Good match");
    expect(p.tone).toBe("neutral");
    expect(p.tradeOff).toBe(
      "The overall score is still good because this team does well on working style and shared interests, but it has trade-offs to weigh before inviting: skill gaps, different goals and limited shared time.",
    );
  });

  it("also tempers Strong when a card is weak, and never invents strengths", () => {
    const t = team({ schedule: { sharedHours: 1, targetHours: 6, windows: [], timeZone: "UTC" }, dimensions: dims({ skill: 0.6 }) });
    const p = matchPresentation(t);
    expect(p).toMatchObject({ label: "Strong match", tone: "neutral" });
    expect(p.tradeOff).toBe("The overall score balances all five factors, but it has trade-offs to weigh before inviting: limited shared time.");
  });

  it("does not credit a dimension whose card reports a weakness", () => {
    const t = team({
      band: "Good",
      roles: [{ role: "AI / ML", level: "default", status: "missing", by: null }],
      dimensions: dims({ skill: 0.9, style: 0.8 }),
    });
    const p = matchPresentation(t);
    expect(p.tradeOff).toBe("The overall score is still good because this team does well on working style, but it has trade-offs to weigh before inviting: skill gaps.");
    expect(p.tradeOff).not.toContain("skill:");
  });

  it("leaves Fair and Weak labels as they are", () => {
    expect(matchPresentation(team({ band: "Fair" }))).toEqual({ label: "Fair match", tone: "caution", tradeOff: null });
    expect(matchPresentation(team({ band: "Weak" }))).toEqual({ label: "Weak match", tone: "low", tradeOff: null });
  });
});
