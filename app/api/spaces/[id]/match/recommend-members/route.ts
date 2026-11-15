import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { spaceIdParam } from "@/lib/api/params";
import { recommendMembers, loadPool, matchParamsSchema } from "@/lib/matching/service";

/**
 * POST /api/spaces/:id/match/recommend-members — Grow My Team: skill gaps and candidates ranked by whole-team improvement (read-only).
 * Eligibility (Space, scope, consent, membership, recruiter rights) is enforced in
 * PostgreSQL by get_match_pool on every call.
 */
export const POST = withAuth<{ id: string }>(async ({ req, supabase, params }) => {
  const spaceId = spaceIdParam(params);
  const input = await parseJson(req, matchParamsSchema);
  const pool = await loadPool(supabase, spaceId, input.team_id);
  return NextResponse.json(recommendMembers(pool, input), { headers: { "cache-control": "no-store" } });
});
