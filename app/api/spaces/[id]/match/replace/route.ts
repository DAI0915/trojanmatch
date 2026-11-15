import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { spaceIdParam } from "@/lib/api/params";
import { replaceCandidate, loadPool, replaceParamsSchema } from "@/lib/matching/service";

/**
 * POST /api/spaces/:id/match/replace — Replace one proposed candidate and re-score the whole team (read-only).
 * Eligibility (Space, scope, consent, membership, recruiter rights) is enforced in
 * PostgreSQL by get_match_pool on every call.
 */
export const POST = withAuth<{ id: string }>(async ({ req, supabase, params }) => {
  const spaceId = spaceIdParam(params);
  const input = await parseJson(req, replaceParamsSchema);
  const pool = await loadPool(supabase, spaceId, input.team_id);
  return NextResponse.json(replaceCandidate(pool, input), { headers: { "cache-control": "no-store" } });
});
