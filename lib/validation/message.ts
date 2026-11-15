import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Write a message first.").max(2000, "Messages can be at most 2000 characters."),
  /** Client-generated id: retries of the same send never create duplicates. */
  client_id: z.uuid(),
});
