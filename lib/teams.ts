import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TeamRequirements } from "@/lib/validation/team";

export type TeamStatus = "draft" | "forming" | "active" | "archived";
export type TeamSummary = {
  id: string;
  name: string;
  description: string | null;
  status: TeamStatus;
  recruiting: boolean;
  target_size: number;
  requirements: TeamRequirements;
  members: number;
};
export type TeamMemberView = { user_id: string; role: "owner" | "member"; can_recruit: boolean; name: string | null; synthetic: boolean };

const TEAM_COLUMNS = "id, name, description, status, recruiting, target_size, requirements, team_members(status)";

type Row = {
  id: string; name: string; description: string | null; status: TeamStatus; recruiting: boolean;
  target_size: number; requirements: unknown; team_members: { status: string }[];
};
const toSummary = (t: Row): TeamSummary => ({
  id: t.id,
  name: t.name,
  description: t.description,
  status: t.status,
  recruiting: t.recruiting,
  target_size: t.target_size,
  requirements: (t.requirements ?? {}) as TeamRequirements,
  members: t.team_members.filter((m) => m.status === "active").length,
});

/** Teams visible to the caller in a Space (RLS): their own + recruiting teams. */
export async function teamsInSpace(spaceId: string, userId: string) {
  const supabase = await createClient();
  const [{ data: mine }, { data: visible }] = await Promise.all([
    supabase
      .from("team_members")
      .select("role, can_recruit, team:teams(" + TEAM_COLUMNS + ")")
      .eq("space_id", spaceId)
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase.from("teams").select(TEAM_COLUMNS).eq("space_id", spaceId).neq("status", "archived").order("created_at", { ascending: false }),
  ]);
  const myRow = (mine ?? [])[0] as unknown as { role: string; can_recruit: boolean; team: Row | null } | undefined;
  const myTeam = myRow?.team ? { ...toSummary(myRow.team), canRecruit: myRow.role === "owner" || myRow.can_recruit } : null;
  const recruiting = ((visible ?? []) as unknown as Row[])
    .filter((t) => t.recruiting && t.id !== myTeam?.id)
    .map(toSummary);
  return { myTeam, recruiting };
}

/** One team (RLS) with members; names only where the viewer may see the profile. */
export async function teamDetail(teamId: string, viewerId: string) {
  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select(TEAM_COLUMNS + ", space_id, owner_id, created_at")
    .eq("id", teamId)
    .maybeSingle();
  if (!team) return null;
  const t = team as unknown as Row & { space_id: string; owner_id: string };
  const { data: rows } = await supabase
    .from("team_members")
    .select("user_id, role, can_recruit, status, joined_at")
    .eq("team_id", teamId)
    .eq("status", "active")
    .order("joined_at");
  const ids = (rows ?? []).map((r) => r.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, display_name, is_synthetic").in("id", ids)
    : { data: [] as { id: string; display_name: string; is_synthetic: boolean }[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const members: TeamMemberView[] = (rows ?? []).map((r) => ({
    user_id: r.user_id,
    role: r.role,
    can_recruit: r.can_recruit,
    name: byId.get(r.user_id)?.display_name ?? null,
    synthetic: byId.get(r.user_id)?.is_synthetic ?? false,
  }));
  const me = members.find((m) => m.user_id === viewerId);
  return {
    team: toSummary(t),
    spaceId: t.space_id,
    members,
    isMember: !!me,
    canRecruit: !!me && (me.role === "owner" || me.can_recruit),
  };
}
