import { NextResponse } from "next/server";
import { parseJson, withAuth } from "@/lib/api/handler";
import { ApiError, fromDbError } from "@/lib/api/errors";
import { teamIdParam } from "@/lib/api/params";
import { requireActiveMember } from "@/lib/api/team-access";
import { sendMessageSchema } from "@/lib/validation/message";

const COLUMNS = "id, author_id, body, client_id, created_at";

/** GET /api/teams/:id/messages — latest 100 messages (accepted members of an active team; RLS). */
export const GET = withAuth<{ id: string }>(async ({ supabase, user, params }) => {
  const teamId = teamIdParam(params);
  await requireActiveMember(supabase, teamId, user.id);
  const { data, error } = await supabase.from("messages").select(COLUMNS).eq("team_id", teamId).order("created_at", { ascending: false }).limit(100);
  if (error) throw fromDbError(error);
  return NextResponse.json({ messages: (data ?? []).reverse() }, { headers: { "cache-control": "no-store" } });
});

/**
 * POST /api/teams/:id/messages — send a text message. The author is always the
 * session user (DB trigger); RLS allows inserts only for accepted members of an
 * active team; (team_id, client_id) is unique, so a retried send is idempotent.
 */
export const POST = withAuth<{ id: string }>(async ({ req, supabase, user, params }) => {
  const teamId = teamIdParam(params);
  const input = await parseJson(req, sendMessageSchema);
  await requireActiveMember(supabase, teamId, user.id);
  const { data, error } = await supabase
    .from("messages")
    .insert({ team_id: teamId, body: input.body, client_id: input.client_id })
    .select(COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase.from("messages").select(COLUMNS).eq("team_id", teamId).eq("client_id", input.client_id).maybeSingle();
      if (existing) return NextResponse.json({ message: existing });
    }
    if (error.code === "42501") throw new ApiError("NOT_TEAM_MEMBER", "Only accepted members of this team can send messages.");
    throw fromDbError(error);
  }
  return NextResponse.json({ message: data }, { status: 201 });
});
