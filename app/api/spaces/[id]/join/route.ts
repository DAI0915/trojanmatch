import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { spaceIdParam } from "@/lib/api/params";
import { joinSpaceSchema } from "@/lib/validation/space";

type JoinResult =
  | { ok: true; already_member: boolean; space_id: string; slug: string }
  | { ok: false; error: "INVALID_CODE" | "RATE_LIMITED" };

/** POST /api/spaces/:id/join — scope, status and join code are enforced in Postgres. */
export const POST = withAuth<{ id: string }>(async ({ req, supabase, params }) => {
  const spaceId = spaceIdParam(params);
  const { code } = await parseJson(req, joinSpaceSchema);
  const { data, error } = await supabase.rpc("join_space", { p_space_id: spaceId, p_code: code });
  if (error) throw fromDbError(error);
  const result = data as JoinResult;
  if (!result.ok) {
    throw result.error === "RATE_LIMITED"
      ? new ApiError("RATE_LIMITED", "Too many incorrect codes. Try again in an hour.")
      : new ApiError("INVALID_CODE", "That join code is not correct.");
  }
  return NextResponse.json({ joined: !result.already_member, slug: result.slug });
});
