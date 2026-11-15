import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { fromDbError } from "@/lib/api/errors";
import { teamIdParam } from "@/lib/api/params";
import { sendInvitationsSchema } from "@/lib/validation/invitation";

/**
 * POST /api/teams/:id/invitations — the owner or a delegated recruiter invites
 * people (explicit action). send_invitations re-validates consent, Space,
 * memberships, duplicates and capacity (incl. pending invitations) in PostgreSQL.
 */
export const POST = withAuth<{ id: string }>(async ({ req, supabase, params }) => {
  const teamId = teamIdParam(params);
  const input = await parseJson(req, sendInvitationsSchema);
  const { data, error } = await supabase.rpc("send_invitations", {
    p_team_id: teamId,
    p_user_ids: input.user_ids,
    p_message: input.message ?? undefined,
  });
  if (error) throw fromDbError(error);
  return NextResponse.json(data, { status: 201 });
});
