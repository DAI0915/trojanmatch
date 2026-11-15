import { z } from "zod";
import { GOALS, INTERESTS, ROLES, SKILLS, type SpaceType } from "@/lib/taxonomy";
import { enumList, tagList } from "./common";

const roleIds = ROLES.map((r) => r.id);
const knownSkill = new Set(SKILLS.map((s) => s.id));
const knownInterest = new Set(INTERESTS.map((i) => i.id));

/**
 * Structured recruitment requirements. Mirrors private.valid_team_requirements()
 * in PostgreSQL (the database re-validates every write).
 */
export const teamRequirementsSchema = (type: SpaceType) =>
  z
    .object({
      must_roles: enumList(roleIds, 6).default([]),
      preferred_roles: enumList(roleIds, 6).default([]),
      skills: tagList(20, (s) => knownSkill.has(s)).default([]),
      topics: tagList(10, (t) => knownInterest.has(t)).default([]),
      goal: z.enum(GOALS[type].map((g) => g.id) as [string, ...string[]]).nullable().default(null),
      min_shared_hours: z.number().int().min(0, "0–40 hours").max(40, "0–40 hours").nullable().default(null),
      note: z.string().trim().max(500).default(""),
    })
    .strict()
    .superRefine((r, ctx) => {
      const both = r.must_roles.filter((x) => r.preferred_roles.includes(x));
      if (both.length) ctx.addIssue({ code: "custom", path: ["preferred_roles"], message: "A role can't be both required and preferred" });
    })
    // Store only what was set, so requirements stay small and readable.
    .transform((r) => {
      const out: Record<string, unknown> = {};
      if (r.must_roles.length) out.must_roles = r.must_roles;
      if (r.preferred_roles.length) out.preferred_roles = r.preferred_roles;
      if (r.skills.length) out.skills = r.skills;
      if (r.topics.length) out.topics = r.topics;
      if (r.goal) out.goal = r.goal;
      if (r.min_shared_hours !== null) out.min_shared_hours = r.min_shared_hours;
      if (r.note) out.note = r.note;
      return out;
    });

const base = (type: SpaceType, minOpen: number) =>
  z.object({
    name: z.string().trim().min(2, "Team name must be 2–60 characters").max(60, "Team name must be 2–60 characters"),
    description: z.string().trim().max(500).default(""),
    open_positions: z.number().int().min(minOpen, minOpen ? "At least one open position" : "Can't be negative").max(19),
    recruiting: z.boolean(),
    requirements: teamRequirementsSchema(type),
  });

export const createTeamSchema = (type: SpaceType) => base(type, 1);
export const updateTeamSchema = (type: SpaceType) => base(type, 0);

export type TeamRequirements = {
  must_roles?: string[];
  preferred_roles?: string[];
  skills?: string[];
  topics?: string[];
  goal?: string;
  min_shared_hours?: number;
  note?: string;
};
