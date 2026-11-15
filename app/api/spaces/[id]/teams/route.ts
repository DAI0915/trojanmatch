import { NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import { parseJson, withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { spaceIdParam } from "@/lib/api/params";
import { createTeamSchema } from "@/lib/validation/team";

/**
 * POST /api/spaces/:id/teams — create a team in a Space the caller joined.
 * The RPC enforces participation, scope, status, deadline, size bounds and the
 * one-team-per-Space rule; the caller becomes owner.
 */
export const POST = withAuth<{ id: string }>(async ({ req, supabase, params }) => {
  const spaceId = spaceIdParam(params);
  const { data: space, error: spaceErr } = await supabase.from("matching_spaces").select("type").eq("id", spaceId).maybeSingle();
  if (spaceErr) throw fromDbError(spaceErr);
  if (!space) throw new ApiError("NOT_FOUND", "Space not found.");

  const input = await parseJson(req, createTeamSchema(space.type));
  const { data, error } = await supabase.rpc("create_team", { p_space_id: spaceId, p_payload: input as unknown as Json });
  if (error) throw fromDbError(error);
  return NextResponse.json({ team: data }, { status: 201 });
});
