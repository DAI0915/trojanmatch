import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { spaceIdParam } from "@/lib/api/params";
import { participationSchema } from "@/lib/validation/participation";

const COLUMNS =
  "space_id, goal, goal_note, desired_roles, topics, availability_override, looking_for_team, accept_invites, smart_match_opt_in, visible_to_members, setup_completed, notes, updated_at";

async function spaceTypeFor(supabase: Parameters<Parameters<typeof withAuth>[0]>[0]["supabase"], spaceId: string) {
  // RLS: visible only if public or the caller participates (and same scope).
  const { data, error } = await supabase.from("matching_spaces").select("type").eq("id", spaceId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ApiError("NOT_FOUND", "Space not found.");
  return data.type;
}

/** GET /api/spaces/:id/participation — the caller's own preferences for THIS Space. */
export const GET = withAuth<{ id: string }>(async ({ supabase, user, params }) => {
  const spaceId = spaceIdParam(params);
  const { data, error } = await supabase
    .from("participations")
    .select(COLUMNS)
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ApiError("NOT_PARTICIPANT", "Join this Space first.");
  return NextResponse.json({ participation: data });
});

/** PUT /api/spaces/:id/participation — updates ONLY this Space's row for the caller. */
export const PUT = withAuth<{ id: string }>(async ({ req, supabase, user, params }) => {
  const spaceId = spaceIdParam(params);
  const type = await spaceTypeFor(supabase, spaceId);
  const input = await parseJson(req, participationSchema(type));
  const { data, error } = await supabase
    .from("participations")
    .update({
      goal: input.goal,
      goal_note: input.goal_note || null,
      desired_roles: input.desired_roles,
      topics: input.topics,
      availability_override: input.availability_override,
      looking_for_team: input.looking_for_team,
      accept_invites: input.accept_invites,
      smart_match_opt_in: input.smart_match_opt_in,
      visible_to_members: input.visible_to_members,
      notes: input.notes || null,
      setup_completed: true,
    })
    .eq("space_id", spaceId)
    .eq("user_id", user.id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ApiError("NOT_PARTICIPANT", "Join this Space first.");
  return NextResponse.json({ participation: data });
});
