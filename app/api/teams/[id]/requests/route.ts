import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { fromDbError } from "@/lib/api/errors";
import { teamIdParam } from "@/lib/api/params";
import { requestToJoinSchema } from "@/lib/validation/invitation";

/** POST /api/teams/:id/requests — ask to join a recruiting team (Find a Team). */
export const POST = withAuth<{ id: string }>(async ({ req, supabase, params }) => {
  const teamId = teamIdParam(params);
  const input = await parseJson(req, requestToJoinSchema);
  const { data, error } = await supabase.rpc("request_to_join", { p_team_id: teamId, p_message: input.message ?? undefined });
  if (error) throw fromDbError(error);
  return NextResponse.json(data, { status: 201 });
});
