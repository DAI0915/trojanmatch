import { z } from "zod";
import { ApiError } from "./errors";

export function invitationIdParam(params: { id: string }): string {
  const r = z.uuid().safeParse(params.id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Invitation not found.");
  return r.data;
}
