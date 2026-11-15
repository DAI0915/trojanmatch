import { NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import { parseJson, withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { teamIdParam } from "@/lib/api/params";
import { updateTeamSchema } from "@/lib/validation/team";

/**
 * PATCH /api/teams/:id — update name, description, open positions, recruiting
 * and requirements. Only the owner or a delegated recruiter (enforced in the RPC).
 */
export const PATCH = withAuth<{ id: string }>(async ({ req, supabase, params }) => {
  const teamId = teamIdParam(params);
  // RLS: only visible teams resolve; the RPC re-checks recruiter rights regardless.
  const { data: team, error: teamErr } = await supabase
    .from("teams")
    .select("id, space:matching_spaces(type)")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw fromDbError(teamErr);
  if (!team?.space) throw new ApiError("NOT_RECRUITER", "You can only edit teams you recruit for.");

  const input = await parseJson(req, updateTeamSchema(team.space.type));
  const { data, error } = await supabase.rpc("update_team", { p_team_id: teamId, p_payload: input as unknown as Json });
  if (error) throw fromDbError(error);
  return NextResponse.json({ team: data });
});
