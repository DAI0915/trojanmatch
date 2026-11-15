import { z } from "zod";
import { GOALS, INTERESTS, ROLES, type SpaceType } from "@/lib/taxonomy";
import { enumList, hourList, tagList } from "./common";

const knownInterest = new Set(INTERESTS.map((i) => i.id));

/** Space-specific preferences. Consent flags have no default here: the client must send them explicitly. */
export const participationSchema = (type: SpaceType) =>
  z.object({
    goal: z.enum(GOALS[type].map((g) => g.id) as [string, ...string[]]).nullable(),
    goal_note: z.string().trim().max(280).optional().default(""),
    desired_roles: enumList(ROLES.map((r) => r.id), 10),
    topics: tagList(20, (t) => knownInterest.has(t)),
    availability_override: hourList.nullable(),
    looking_for_team: z.boolean(),
    accept_invites: z.boolean(),
    smart_match_opt_in: z.boolean(),
    visible_to_members: z.boolean(),
    notes: z.string().trim().max(500).optional().default(""),
  });

export type ParticipationData = z.output<ReturnType<typeof participationSchema>>;
