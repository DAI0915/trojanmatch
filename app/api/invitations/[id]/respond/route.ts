import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { invitationIdParam } from "@/lib/api/invitation-params";
import { respondSchema } from "@/lib/validation/invitation";

type Outcome = { outcome: "accepted" | "declined" | "expired"; reason?: "ttl" | "joined_other_team"; team_id: string; team_status: string; activated?: boolean };

/**
 * POST /api/invitations/:id/respond — accept or decline. The invitee answers
 * invitations; the team's owner/recruiters answer join requests (RPC-enforced).
 * An expired invitation is recorded as expired and reported as INVITE_EXPIRED.
 */
export const POST = withAuth<{ id: string }>(async ({ req, supabase, params }) => {
  const id = invitationIdParam(params);
  const input = await parseJson(req, respondSchema);
  const { data, error } = await supabase.rpc("respond_invitation", {
    p_invitation_id: id,
    p_accept: input.accept,
    p_leave_solo_draft: input.leave_solo_draft,
  });
  if (error) throw fromDbError(error);
  const result = data as unknown as Outcome;
  if (result.outcome === "expired") {
    throw new ApiError(
      "INVITE_EXPIRED",
      result.reason === "joined_other_team"
        ? "This student has already joined another team, so the request was closed."
        : "This invitation expired before it was answered. Ask the team to send a new one.",
    );
  }
  return NextResponse.json(result);
});
