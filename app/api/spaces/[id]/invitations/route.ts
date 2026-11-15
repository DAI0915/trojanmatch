import { NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import { parseJson, withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { spaceIdParam } from "@/lib/api/params";
import { startTeamSchema } from "@/lib/validation/invitation";

/**
 * POST /api/spaces/:id/invitations — Smart Team Formation for someone without a
 * team: creates the team AND sends the chosen invitations in one transaction
 * (start_team_with_invitations), so a failed invitation never leaves a team behind.
 */
export const POST = withAuth<{ id: string }>(async ({ req, supabase, params }) => {
  const spaceId = spaceIdParam(params);
  const { data: space, error: spaceErr } = await supabase.from("matching_spaces").select("type").eq("id", spaceId).maybeSingle();
  if (spaceErr) throw fromDbError(spaceErr);
  if (!space) throw new ApiError("NOT_FOUND", "Space not found.");

  const input = await parseJson(req, startTeamSchema(space.type));
  const { data, error } = await supabase.rpc("start_team_with_invitations", {
    p_space_id: spaceId,
    p_team: input.team as unknown as Json,
    p_user_ids: input.user_ids,
    p_message: input.message ?? undefined,
  });
  if (error) throw fromDbError(error);
  return NextResponse.json(data, { status: 201 });
});
