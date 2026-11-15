import { z } from "zod";
import { blankToUndefined, httpUrl, timeZone } from "./common";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a date and time");
const teamSize = z.coerce.number().int().min(1).max(20);

const teamSizeRefine = (v: { min_team_size?: number; max_team_size?: number }, ctx: z.RefinementCtx) => {
  const { min_team_size: min, max_team_size: max } = v;
  if ((min === undefined) !== (max === undefined)) {
    ctx.addIssue({ code: "custom", path: ["max_team_size"], message: "Enter both minimum and maximum, or neither" });
  } else if (min !== undefined && max !== undefined && (max < min || max < 2)) {
    ctx.addIssue({ code: "custom", path: ["max_team_size"], message: "Maximum must be ≥ minimum and at least 2" });
  }
};

export const hackathonSpaceSchema = z
  .object({
    type: z.literal("hackathon"),
    title: z.string().trim().min(3, "Event name is required").max(120),
    edition_year: z.coerce.number().int().min(2000).max(2100),
    organizer: blankToUndefined(z.string().trim().max(140)),
    official_url: blankToUndefined(httpUrl),
    start_date: isoDate,
    end_date: isoDate,
    timezone: timeZone,
    format: z.enum(["in_person", "online", "hybrid"]),
    location: blankToUndefined(z.string().trim().max(200)),
    rules_url: blankToUndefined(httpUrl),
    min_team_size: blankToUndefined(teamSize),
    max_team_size: blankToUndefined(teamSize),
    team_deadline_local: blankToUndefined(localDateTime),
    visibility: z.enum(["public", "unlisted"]),
  })
  .superRefine((v, ctx) => {
    if (v.end_date < v.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "End date must be on or after the start date" });
    }
    teamSizeRefine(v, ctx);
  });

export const courseSpaceSchema = z
  .object({
    type: z.literal("course"),
    university: z.string().trim().min(2, "University is required").max(120),
    term: z.string().trim().regex(/^(Spring|Summer|Fall|Winter) \d{4}$/, "Choose a term"),
    course_code: z.string().trim().min(2, "Course code is required").max(30),
    course_title: blankToUndefined(z.string().trim().max(140)),
    allowed_sections: z
      .array(z.string().trim().min(1).max(30))
      .min(1, "List at least one section")
      .max(20),
    assignment_name: z.string().trim().min(2, "Assignment is required").max(140),
    assignment_key: blankToUndefined(z.string().trim().max(60)),
    min_team_size: teamSize,
    max_team_size: teamSize,
    timezone: timeZone,
    team_deadline_local: blankToUndefined(localDateTime),
    instructions_url: blankToUndefined(httpUrl),
    visibility: z.enum(["public", "unlisted"]),
  })
  .superRefine(teamSizeRefine);

export const createSpaceSchema = z.discriminatedUnion("type", [hackathonSpaceSchema, courseSpaceSchema]);
export type CreateSpaceInput = z.input<typeof createSpaceSchema>;
export type CreateSpacePayload = z.output<typeof createSpaceSchema>;

export const joinSpaceSchema = z.object({
  code: z.string().trim().max(20).optional(),
});

/** "Section 1, 2" → ["Section 1", "2"] */
export function parseSections(raw: string): string[] {
  return raw
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
