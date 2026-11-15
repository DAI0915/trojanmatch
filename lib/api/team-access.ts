import "server-only";
import { ApiError } from "./errors";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * UX-level check that the caller is an accepted member of an ACTIVE team, so we
 * can return a clear error. PostgreSQL RLS enforces the same rule on every
 * read/write regardless of this check.
 */
export async function requireActiveMember(supabase: Supabase, teamId: string, userId: string) {
  const [{ data: team }, { data: me }] = await Promise.all([
    supabase.from("teams").select("id, status").eq("id", teamId).maybeSingle(),
    supabase.from("team_members").select("user_id").eq("team_id", teamId).eq("user_id", userId).eq("status", "active").maybeSingle(),
  ]);
  if (!team || !me) throw new ApiError("NOT_TEAM_MEMBER", "Only accepted members of this team can use its workspace.");
  if (team.status !== "active") throw new ApiError("TEAM_NOT_ACTIVE", "Team chat opens once the team is Active.");
}
