import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { fromDbError } from "@/lib/api/errors";
import { teamIdParam } from "@/lib/api/params";

/**
 * POST /api/teams/:id/finalize — OWNER-only early activation once the Space
 * minimum is met; pending invitations are cancelled (team_finalized).
 */
export const POST = withAuth<{ id: string }>(async ({ supabase, params }) => {
  const teamId = teamIdParam(params);
  const { data, error } = await supabase.rpc("finalize_team", { p_team_id: teamId });
  if (error) throw fromDbError(error);
  return NextResponse.json(data);
});
