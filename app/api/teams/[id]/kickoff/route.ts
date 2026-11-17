import { NextResponse } from "next/server";
import type { Json } from "@/lib/database.types";
import { withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { teamIdParam } from "@/lib/api/params";
import { generateKickoff, templateBrief } from "@/lib/ai/kickoff";
import { loadWorkspace } from "@/lib/workspace";

export const maxDuration = 30;

/**
 * POST /api/teams/:id/kickoff — explicit "Generate kickoff". Only accepted
 * members of an ACTIVE team (checked here, and again by RLS on insert). The
 * model sees only this team's consented matching features + deterministic fit
 * facts; never chat history or anyone outside the team. Limited to 6 per team
 * per hour (checked before calling Gemini, enforced by a DB trigger). Demo
 * sandboxes additionally draw from a capped Gemini budget (demo_ai_quota_take).
 */
export const POST = withAuth<{ id: string }>(async ({ supabase, user, params }) => {
  const teamId = teamIdParam(params);
  const access = await loadWorkspace(teamId, user.id, { messages: false });
  if (!access.ok) {
    if (access.reason === "not_active") throw new ApiError("TEAM_NOT_ACTIVE", "AI Kickoff is available once the team is Active.");
    throw new ApiError("NOT_TEAM_MEMBER", "Only accepted members of this team can generate a kickoff.");
  }
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase.from("kickoff_briefs").select("id", { count: "exact", head: true }).eq("team_id", teamId).gt("created_at", since);
  if ((count ?? 0) >= 6) throw new ApiError("RATE_LIMITED", "This team generated several kickoffs in the last hour. Try again later.");

  // Demo sandboxes have a small shared Gemini budget (per sandbox per hour and
  // across all sandboxes per day). Production users are unaffected. Over budget,
  // the deterministic template is used and labeled honestly in the UI.
  const { data: aiAllowed } = await supabase.rpc("demo_ai_quota_take");
  const brief = aiAllowed === true ? await generateKickoff(access.workspace) : templateBrief(access.workspace, "demo_limit");
  const { data, error } = await supabase
    .from("kickoff_briefs")
    .insert({ team_id: teamId, brief: brief as unknown as NonNullable<Json>, source: brief.source })
    .select("id, brief, source, created_at, generated_by")
    .single();
  if (error) {
    if (error.code === "42501") throw new ApiError("NOT_TEAM_MEMBER", "Only accepted members of this team can generate a kickoff.");
    throw fromDbError(error);
  }
  return NextResponse.json({ kickoff: data }, { status: 201 });
});
