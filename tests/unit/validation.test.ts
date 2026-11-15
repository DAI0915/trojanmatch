import { describe, expect, it } from "vitest";
import { normalizeCustomTag } from "@/lib/taxonomy";
import { profileCompleteness, profileSchema } from "@/lib/validation/profile";
import { participationSchema } from "@/lib/validation/participation";
import { createSpaceSchema, parseSections } from "@/lib/validation/space";

const profile = {
  display_name: "Ada",
  university: "USC",
  bio: "",
  skills: ["python", "Unity 3D"],
  roles: ["backend"],
  interests: ["education"],
  experience: "intermediate",
  working_style: { sync: "mixed" },
  availability: [20, 21, 20],
  timezone: "America/Los_Angeles",
};

describe("profile schema", () => {
  it("accepts structured + custom values and normalizes them", () => {
    const r = profileSchema.parse(profile);
    expect(r.skills).toEqual(["python", "unity 3d"]);
    expect(r.availability).toEqual([20, 21]);
    expect(profileCompleteness(r)).toEqual({ complete: true, missing: [] });
  });
  it("rejects unknown roles, interests, working-style values and time zones", () => {
    expect(profileSchema.safeParse({ ...profile, roles: ["ceo"] }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, interests: ["crypto-moon"] }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, working_style: { sync: "never" } }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, working_style: { vibe: "x" } }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, timezone: "Mars/Base" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, availability: [200] }).success).toBe(false);
  });
  it("reports missing required fields", () => {
    const r = profileSchema.parse({ ...profile, skills: [], experience: null, availability: [] });
    expect(profileCompleteness(r).missing).toEqual(["skills", "experience", "availability"]);
  });
  it("normalizes custom tags and rejects junk", () => {
    expect(normalizeCustomTag("  C#  ")).toBe("c#");
    expect(normalizeCustomTag("<script>")).toBeNull();
    expect(normalizeCustomTag("x".repeat(31))).toBeNull();
  });
});

describe("participation schema is per Space type", () => {
  const base = {
    goal: "competitive", goal_note: "", desired_roles: ["frontend"], topics: ["health"],
    availability_override: null, looking_for_team: false, accept_invites: false,
    smart_match_opt_in: false, visible_to_members: false, notes: "",
  };
  it("accepts hackathon goals only for hackathons", () => {
    expect(participationSchema("hackathon").safeParse(base).success).toBe(true);
    expect(participationSchema("course").safeParse(base).success).toBe(false);
    expect(participationSchema("course").safeParse({ ...base, goal: "aim_a" }).success).toBe(true);
  });
  it("requires explicit consent booleans (no silent defaults)", () => {
    const withoutConsent: Record<string, unknown> = { ...base };
    delete withoutConsent.visible_to_members;
    expect(participationSchema("hackathon").safeParse(withoutConsent).success).toBe(false);
  });
});

describe("space creation schema", () => {
  const hack = {
    type: "hackathon", title: "TreeHacks", edition_year: "2027", start_date: "2027-02-14", end_date: "2027-02-16",
    timezone: "America/Los_Angeles", format: "in_person", visibility: "public",
    official_url: "", organizer: "", location: "", rules_url: "", min_team_size: "", max_team_size: "", team_deadline_local: "",
  };
  it("accepts a minimal hackathon (blank optionals become undefined)", () => {
    const r = createSpaceSchema.parse(hack);
    expect(r).toMatchObject({ type: "hackathon", edition_year: 2027 });
    expect("official_url" in r && r.official_url).toBeFalsy();
  });
  it("rejects end before start, non-http URLs and half-specified team sizes", () => {
    expect(createSpaceSchema.safeParse({ ...hack, end_date: "2027-02-13" }).success).toBe(false);
    expect(createSpaceSchema.safeParse({ ...hack, official_url: "javascript:alert(1)" }).success).toBe(false);
    expect(createSpaceSchema.safeParse({ ...hack, min_team_size: "2" }).success).toBe(false);
  });
  it("requires course term format, sections and team size", () => {
    const course = {
      type: "course", university: "USC", term: "Fall 2026", course_code: "CSCI 567", allowed_sections: ["Section 1"],
      assignment_name: "Final Project", min_team_size: 3, max_team_size: 4, timezone: "America/Los_Angeles",
      visibility: "unlisted",
    };
    expect(createSpaceSchema.safeParse(course).success).toBe(true);
    expect(createSpaceSchema.safeParse({ ...course, term: "fall" }).success).toBe(false);
    expect(createSpaceSchema.safeParse({ ...course, allowed_sections: [] }).success).toBe(false);
    expect(createSpaceSchema.safeParse({ ...course, max_team_size: 2, min_team_size: 3 }).success).toBe(false);
  });
  it("parses section lists", () => {
    expect(parseSections("Section 1, 2;\n3 ")).toEqual(["Section 1", "2", "3"]);
  });
});
