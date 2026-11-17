import "server-only";
import type { DemoPerson, SwitchContext } from "@/components/demo/persona-switcher";
import type { createClient } from "@/lib/supabase/server";
import { demoDirectory } from "./directory";
import { parsePersonaEmail } from "./personas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Data for the demo bar's "Switch student" picker, from the CURRENT persona's
 * point of view and through its own RLS-bound client: no service role, nothing
 * outside the visitor's sandbox (RLS limits every row to the caller's scope).
 */
export async function demoSwitchContext(
  supabase: Supabase,
  userId: string,
  email: string | undefined,
  name: string,
): Promise<SwitchContext> {
  const now = new Date().toISOString();
  const [{ data: sent }, { data: mine }, { count: incoming }] = await Promise.all([
    // Pending invitations the caller can see (RLS: active members of the inviting team).
    supabase
      .from("invitations")
      .select("user_id, created_at, team:teams(name)")
      .eq("kind", "invite")
      .eq("status", "pending")
      .gt("expires_at", now)
      .neq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(30),
    supabase.from("team_members").select("team_id, team:teams(name)").eq("user_id", userId).eq("status", "active").limit(10),
    supabase
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("kind", "invite")
      .eq("status", "pending")
      .gt("expires_at", now),
  ]);

  const myTeams = (mine ?? []) as unknown as { team_id: string; team: { name: string } | null }[];
  const teamName = new Map(myTeams.map((t) => [t.team_id, t.team?.name ?? null]));
  const { data: mates } = myTeams.length
    ? await supabase
        .from("team_members")
        .select("user_id, team_id, joined_at")
        .in("team_id", [...teamName.keys()])
        .eq("status", "active")
        .neq("user_id", userId)
        .order("joined_at")
        .limit(40)
    : { data: [] as { user_id: string; team_id: string }[] };

  const invitations = (sent ?? []) as unknown as { user_id: string; team: { name: string } | null }[];
  const ids = [...new Set([...invitations.map((i) => i.user_id), ...(mates ?? []).map((m) => m.user_id)])];
  const { data: people } = ids.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.display_name]));

  const dedupe = (list: DemoPerson[]) => list.filter((p, i) => list.findIndex((q) => q.userId === p.userId) === i);
  const invited = dedupe(
    invitations.flatMap((i) => (nameOf.has(i.user_id) ? [{ userId: i.user_id, name: nameOf.get(i.user_id)!, team: i.team?.name ?? null }] : [])),
  );
  const teammates = dedupe(
    (mates ?? []).flatMap((m) =>
      nameOf.has(m.user_id) ? [{ userId: m.user_id, name: nameOf.get(m.user_id)!, team: teamName.get(m.team_id) ?? null }] : [],
    ),
  );

  return {
    current: { key: parsePersonaEmail(email)?.key ?? null, name, userId },
    directory: demoDirectory(),
    invited,
    teammates,
    incoming: incoming ?? 0,
  };
}
