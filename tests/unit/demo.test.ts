import { describe, expect, it } from "vitest";
import { DEMO_PARTICIPATIONS, DEMO_PERSONAS, DEMO_SPACES, DEMO_SPACE_COUNTS } from "@/lib/demo/fixtures";
import { personaPassword } from "@/lib/demo/password";
import {
  SWITCHABLE_PERSONAS,
  formatLeaseCookie,
  isSwitchablePersona,
  parseLeaseCookie,
  parsePersonaEmail,
  personaEmail,
  scopeSlot,
} from "@/lib/demo/personas";
import { profileSchema } from "@/lib/validation/profile";
import { participationSchema } from "@/lib/validation/participation";

const TOKEN = "A".repeat(43);

describe("persona allowlist", () => {
  it("allows exactly the four switchable personas", () => {
    expect(SWITCHABLE_PERSONAS.map((p) => p.key)).toEqual(["jordan", "maya", "priya", "alex"]);
    for (const k of ["jordan", "maya", "priya", "alex"]) expect(isSwitchablePersona(k)).toBe(true);
    for (const k of ["ethan", "admin", "", "jordan@x", "../jordan", 1, null, undefined]) expect(isSwitchablePersona(k)).toBe(false);
  });
  it("derives emails from key + slot only, on a reserved TLD", () => {
    expect(personaEmail("jordan", 0)).toBe("jordan.s0@demo.trojanmatch.invalid");
    expect(personaEmail("maya", 7)).toBe("maya.s7@demo.trojanmatch.invalid");
    expect(() => personaEmail("dev1@trojanmatch.test", 1)).toThrow();
    expect(() => personaEmail("jordan", 21)).toThrow();
  });
  it("parses only synthetic demo addresses back to {key, slot}", () => {
    expect(parsePersonaEmail("maya.s7@demo.trojanmatch.invalid")).toEqual({ key: "maya", slot: 7 });
    expect(parsePersonaEmail(personaEmail("daniel", 12))).toEqual({ key: "daniel", slot: 12 });
    for (const bad of [null, undefined, "", "dev1@trojanmatch.test", "maya.s7@demo.trojanmatch.invalid.evil.com", "maya.s99@demo.trojanmatch.invalid", "x@demo.trojanmatch.invalid"]) {
      expect(parsePersonaEmail(bad)).toBeNull();
    }
  });
  it("reads the slot of a demo scope only", () => {
    expect(scopeSlot("demo:3")).toBe(3);
    for (const s of ["prod", "demo:", "demo:x", "demo:123", null, undefined]) expect(scopeSlot(s)).toBeNull();
  });
});

describe("lease cookie", () => {
  it("round-trips and rejects malformed values", () => {
    expect(parseLeaseCookie(formatLeaseCookie(0, TOKEN))).toEqual({ slot: 0, token: TOKEN });
    for (const bad of [undefined, "", "0", `0.${TOKEN}x`, `x.${TOKEN}`, `99.${TOKEN}`, `0.${"A".repeat(42)}`, `0.${"A".repeat(42)}=`]) {
      expect(parseLeaseCookie(bad)).toBeNull();
    }
  });
});

describe("persona passwords", () => {
  const secret = "s".repeat(32);
  it("are deterministic per email and differ across personas and secrets", () => {
    const a = personaPassword(secret, personaEmail("jordan", 1));
    expect(a).toBe(personaPassword(secret, personaEmail("jordan", 1)));
    expect(a).not.toBe(personaPassword(secret, personaEmail("maya", 1)));
    expect(a).not.toBe(personaPassword("t".repeat(32), personaEmail("jordan", 1)));
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
  it("refuse weak secrets", () => {
    expect(() => personaPassword("short", personaEmail("jordan", 1))).toThrow();
  });
});

describe("synthetic fixture", () => {
  it("has ~40–45 unique personas including the four switchable ones", () => {
    expect(DEMO_PERSONAS.length).toBeGreaterThanOrEqual(40);
    expect(DEMO_PERSONAS.length).toBeLessThanOrEqual(45);
    const keys = DEMO_PERSONAS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ["jordan", "maya", "priya", "alex"]) expect(keys).toContain(k);
  });
  it("every persona is a valid, complete profile and is labeled synthetic", () => {
    for (const p of DEMO_PERSONAS) {
      const r = profileSchema.safeParse({ ...p, experience: p.experience });
      expect(r.success, p.key).toBe(true);
      expect(p.availability.length, p.key).toBeGreaterThan(0);
      expect(p.bio).toContain("Synthetic");
    }
  });
  it("is varied (roles, experience, goals, availability)", () => {
    const roles = new Set(DEMO_PERSONAS.flatMap((p) => p.roles));
    expect(roles.size).toBeGreaterThanOrEqual(8);
    expect(new Set(DEMO_PERSONAS.map((p) => p.experience))).toEqual(new Set(["beginner", "intermediate", "advanced"]));
    expect(new Set(DEMO_PERSONAS.map((p) => p.hackathon_goal)).size).toBe(3);
    expect(new Set(DEMO_PERSONAS.map((p) => p.availability.join(","))).size).toBeGreaterThan(10);
  });
  it("defines the planned Spaces and does NOT pre-create TreeHacks 2027", () => {
    expect(DEMO_SPACES.map((s) => s.key)).toEqual(["ai_usc_2026", "treehacks_2026", "csci567_fall2026"]);
    expect(JSON.stringify(DEMO_SPACES)).not.toMatch(/2027/);
    expect(DEMO_SPACE_COUNTS).toEqual({ ai_usc_2026: 32, treehacks_2026: 6, csci567_fall2026: 16 });
    expect(DEMO_SPACES.find((s) => s.key === "csci567_fall2026")?.visibility).toBe("unlisted");
  });
  it("participations are valid for their Space type and some personas opt out", () => {
    const typeOf = Object.fromEntries(DEMO_SPACES.map((s) => [s.key, s.type]));
    for (const p of DEMO_PARTICIPATIONS) {
      const r = participationSchema(typeOf[p.space] as "hackathon" | "course").safeParse({ ...p, goal_note: "", availability_override: null, notes: "" });
      expect(r.success, `${p.space}/${p.persona}`).toBe(true);
    }
    expect(DEMO_PARTICIPATIONS.some((p) => !p.smart_match_opt_in)).toBe(true);
    // Overlapping personas carry different goals per Space.
    const jordan = DEMO_PARTICIPATIONS.filter((p) => p.persona === "jordan").map((p) => p.goal);
    expect(new Set(jordan).size).toBe(2);
  });
});

describe("demo student directory (Switch student picker)", () => {
  it("lists all 44 synthetic personas once, the four quick-access personas first", async () => {
    const { demoDirectory } = await import("@/lib/demo/directory");
    const dir = demoDirectory();
    expect(dir).toHaveLength(DEMO_PERSONAS.length);
    expect(dir).toHaveLength(44);
    expect(new Set(dir.map((d) => d.key)).size).toBe(44);
    expect(dir.slice(0, 4).map((d) => d.key)).toEqual(SWITCHABLE_PERSONAS.map((p) => p.key));
    expect(dir.filter((d) => d.quick)).toHaveLength(4);
    for (const d of dir) expect(DEMO_PERSONAS.some((p) => p.key === d.key && p.display_name === d.name)).toBe(true);
  });

  it("exposes only keys, names and labels: no emails, ids or secrets", async () => {
    const { demoDirectory } = await import("@/lib/demo/directory");
    const json = JSON.stringify(demoDirectory());
    expect(json).not.toMatch(/@|\.invalid|password|[0-9a-f]{8}-[0-9a-f]{4}-/i);
    for (const d of demoDirectory()) expect(Object.keys(d).sort()).toEqual(["blurb", "key", "name", "quick", "roles"]);
  });
});
