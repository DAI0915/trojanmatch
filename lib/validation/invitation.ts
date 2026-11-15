import { z } from "zod";
import type { SpaceType } from "@/lib/taxonomy";
import { createTeamSchema } from "./team";

const message = z
  .string()
  .trim()
  .max(280, "Keep the message under 280 characters.")
  .transform((s) => (s === "" ? null : s))
  .nullish();

/** Invite 1–10 people at once (the database re-validates every one of them). */
export const sendInvitationsSchema = z.object({
  user_ids: z.array(z.uuid()).min(1, "Choose at least one person.").max(10, "Invite at most 10 people at once."),
  message,
});

/** Smart Team Formation without a team yet: name the team, then invite. */
export const startTeamSchema = (type: SpaceType) =>
  sendInvitationsSchema.extend({ team: createTeamSchema(type) });

export const requestToJoinSchema = z.object({ message });

export const respondSchema = z.object({
  accept: z.boolean(),
  leave_solo_draft: z.boolean().default(false),
});
