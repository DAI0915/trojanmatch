import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api/handler";
import { fromDbError } from "@/lib/api/errors";
import { invitationIdParam } from "@/lib/api/invitation-params";

/** POST /api/invitations/:id/cancel — team cancels an invitation / student withdraws a request. */
export const POST = withAuth<{ id: string }>(async ({ supabase, params }) => {
  const id = invitationIdParam(params);
  const { data, error } = await supabase.rpc("cancel_invitation", { p_invitation_id: id });
  if (error) throw fromDbError(error);
  return NextResponse.json(data);
});
