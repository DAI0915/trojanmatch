import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { spaceIdParam } from "@/lib/api/params";
import { formProposal, loadPool, matchParamsSchema } from "@/lib/matching/service";

/**
 * POST /api/spaces/:id/match/form-team — Smart Team Formation: proposes a COMPLETE team (read-only; nobody is invited).
 * Eligibility (Space, scope, consent, membership, recruiter rights) is enforced in
 * PostgreSQL by get_match_pool on every call.
 */
export const POST = withAuth<{ id: string }>(async ({ req, supabase, params }) => {
  const spaceId = spaceIdParam(params);
  const input = await parseJson(req, matchParamsSchema);
  const pool = await loadPool(supabase, spaceId, input.team_id);
  return NextResponse.json(formProposal(pool, input), { headers: { "cache-control": "no-store" } });
});
