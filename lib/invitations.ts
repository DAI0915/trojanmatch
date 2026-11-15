import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TeamStatus } from "@/lib/teams";

export type InviteKind = "invite" | "request";
export type InviteStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

export type InvitationView = {
  id: string;
  kind: InviteKind;
  status: InviteStatus;
  statusReason: string | null;
  message: string | null;
  expiresAt: string;
  createdAt: string;
  respondedAt: string | null;
  userId: string;
  actorId: string;
  /** The student (invitee or requester). Null name = profile not shared with the viewer. */
  person: { id: string; name: string | null; synthetic: boolean };
  actorName: string | null;
  team: { id: string; name: string; status: TeamStatus; targetSize: number; members: number; spaceSlug: string; spaceTitle: string };
};

type Row = {
  id: string; kind: InviteKind; status: InviteStatus; status_reason: string | null; message: string | null;
  expires_at: string; created_at: string; responded_at: string | null; user_id: string; actor_id: string; team_id: string;
  team: {
    id: string; name: string; status: TeamStatus; target_size: number;
    team_members: { status: string }[];
    space: { slug: string; title: string } | null;
  } | null;
};

const COLUMNS =
  "id, kind, status, status_reason, message, expires_at, created_at, responded_at, user_id, actor_id, team_id, " +
  "team:teams(id, name, status, target_size, team_members(status), space:matching_spaces(slug, title))";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function withNames(supabase: Supabase, rows: Row[]): Promise<InvitationView[]> {
  const ids = [...new Set(rows.flatMap((r) => [r.user_id, r.actor_id]))];
  // RLS: only profiles the viewer may see (invitation counterparts, teammates, consenting Space members).
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, display_name, is_synthetic").in("id", ids)
    : { data: [] as { id: string; display_name: string; is_synthetic: boolean }[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  return rows
    .filter((r) => r.team?.space)
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      statusReason: r.status_reason,
      message: r.message,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      respondedAt: r.responded_at,
      userId: r.user_id,
      actorId: r.actor_id,
      person: { id: r.user_id, name: byId.get(r.user_id)?.display_name ?? null, synthetic: byId.get(r.user_id)?.is_synthetic ?? false },
      actorName: byId.get(r.actor_id)?.display_name ?? null,
      team: {
        id: r.team!.id,
        name: r.team!.name,
        status: r.team!.status,
        targetSize: r.team!.target_size,
        members: r.team!.team_members.filter((m) => m.status === "active").length,
        spaceSlug: r.team!.space!.slug,
        spaceTitle: r.team!.space!.title,
      },
    }));
}

/** A pending row past its expiry is treated as expired everywhere (the DB sweeps it lazily). */
export const effectiveStatus = (i: Pick<InvitationView, "status" | "expiresAt">): InviteStatus =>
  i.status === "pending" && new Date(i.expiresAt) <= new Date() ? "expired" : i.status;

/**
 * Everything on the Invitations page. Expires stale rows first (lazy expiry),
 * then reads through RLS: rows addressed to me, and rows of teams I'm on.
 */
export async function loadInbox(userId: string) {
  const supabase = await createClient();
  await supabase.rpc("refresh_invitations");

  const { data: memberships } = await supabase
    .from("team_members")
    .select("team_id, role, can_recruit")
    .eq("user_id", userId)
    .eq("status", "active");
  const myTeamIds = (memberships ?? []).map((m) => m.team_id);
  const recruiterOf = new Set((memberships ?? []).filter((m) => m.role === "owner" || m.can_recruit).map((m) => m.team_id));

  const [{ data: mine }, { data: teams }] = await Promise.all([
    supabase.from("invitations").select(COLUMNS).eq("user_id", userId).order("created_at", { ascending: false }).limit(60),
    myTeamIds.length
      ? supabase.from("invitations").select(COLUMNS).in("team_id", myTeamIds).neq("user_id", userId).order("created_at", { ascending: false }).limit(80)
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const all = await withNames(supabase, [...((mine ?? []) as unknown as Row[]), ...((teams ?? []) as unknown as Row[])]);
  const pending = (i: InvitationView) => effectiveStatus(i) === "pending";
  const forMe = all.filter((i) => i.userId === userId);
  const forTeams = all.filter((i) => i.userId !== userId);

  return {
    incoming: forMe.filter((i) => i.kind === "invite" && pending(i)),
    myRequests: forMe.filter((i) => i.kind === "request" && pending(i)),
    teamRequests: forTeams.filter((i) => i.kind === "request" && pending(i)),
    teamInvites: forTeams.filter((i) => i.kind === "invite" && pending(i)),
    history: all
      .filter((i) => !pending(i))
      .sort((a, b) => (b.respondedAt ?? b.createdAt).localeCompare(a.respondedAt ?? a.createdAt))
      .slice(0, 25),
    recruiterOf,
  };
}

/** Invitations and requests of one team (RLS: active members only). */
export async function loadTeamInvitations(teamId: string) {
  const supabase = await createClient();
  await supabase.rpc("refresh_invitations");
  const { data } = await supabase.from("invitations").select(COLUMNS).eq("team_id", teamId).order("created_at", { ascending: false }).limit(100);
  return withNames(supabase, (data ?? []) as unknown as Row[]);
}

/** The viewer's own pending request/invitation for a team (for non-members). */
export async function myOpenInvitation(teamId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invitations")
    .select("id, kind, expires_at")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data as { id: string; kind: InviteKind; expires_at: string } | null;
}

export async function pendingInvitationCount(userId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "invite")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString());
  return count ?? 0;
}

export const REASON_LABEL: Record<string, string> = {
  ttl: "expired without an answer",
  joined_other_team: "joined another team",
  team_full: "the team filled up",
  team_finalized: "the team was finalized",
  team_closed: "the team was closed",
  cancelled_by_team: "cancelled by the team",
  withdrawn: "withdrawn",
};
