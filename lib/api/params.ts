import { z } from "zod";
import { ApiError } from "./errors";

const uuid = z.uuid();

export function spaceIdParam(params: { id: string }): string {
  const r = uuid.safeParse(params.id);
  if (!r.success) throw new ApiError("NOT_FOUND", "Space not found.");
  return r.data;
}
