import { z } from "zod";
import { EXPERIENCE, INTERESTS, ROLES, SKILLS, WORKING_STYLE } from "@/lib/taxonomy";
import { enumList, hourList, tagList, timeZone } from "./common";

const ids = <T extends { id: string }>(l: readonly T[]) => l.map((o) => o.id);
const knownSkill = new Set(ids(SKILLS));

const styleEnum = <K extends keyof typeof WORKING_STYLE>(k: K) =>
  z.enum(WORKING_STYLE[k].options.map((o) => o.id) as [string, ...string[]]);

export const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Display name is required").max(60),
  university: z.string().trim().max(120).optional().default(""),
  bio: z.string().trim().max(1000).optional().default(""),
  skills: tagList(40, (s) => knownSkill.has(s)),
  roles: enumList(ids(ROLES), 10),
  interests: enumList(ids(INTERESTS), 30),
  experience: z.enum(ids(EXPERIENCE) as [string, ...string[]]).nullable(),
  working_style: z
    .object({
      sync: styleEnum("sync").optional(),
      planning: styleEnum("planning").optional(),
      comm: styleEnum("comm").optional(),
    })
    .strict(),
  availability: hourList,
  timezone: timeZone,
});

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileData = z.output<typeof profileSchema>;

/** Spec §3.1 required fields; a profile is "complete" only when all are set. */
export function profileCompleteness(p: Pick<ProfileData, "display_name" | "skills" | "roles" | "interests" | "experience" | "availability">) {
  const missing: string[] = [];
  if (!p.display_name) missing.push("display name");
  if (p.skills.length === 0) missing.push("skills");
  if (p.roles.length === 0) missing.push("preferred roles");
  if (p.interests.length === 0) missing.push("interests");
  if (!p.experience) missing.push("experience");
  if (p.availability.length === 0) missing.push("availability");
  return { complete: missing.length === 0, missing };
}
