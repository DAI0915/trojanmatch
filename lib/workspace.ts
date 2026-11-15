import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PRESETS, buildContext, defaultPreset, defaultRolesFor, evaluate, type Needs, type Person } from "@/lib/matching/engine";
import { toTeamView, type TeamView } from "@/lib/matching/view";
import type { SpaceType } from "@/lib/taxonomy";
import type { TeamStatus } from "@/lib/teams";
import type { TeamRequirements } from "@/lib/validation/team";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ChatMessage = { id: string; author_id: string; body: string; client_id: string | null; created_at: string };
export type WorkspaceMember = {
  id: string; name: string; synthetic: boolean; owner: boolean; roles: string[]; skills: string[];
  /** Raw ids for grounding the kickoff (taxonomy tags only). */
  skillIds: string[]; interestIds: string[]; goal: string | null; experience: string | null;
};
export type KickoffRecord = { id: string; brief: unknown; source: "llm" | "template"; created_at: string; generated_by: string };

export type Workspace = {
  team: { id: string; name: string; description: string | null; status: TeamStatus; targetSize: number; requirements: TeamRequirements; activationMode: string | null };
  space: { id: string; slug: string; title: string; type: SpaceType };
  members: WorkspaceMember[];
  /** Deterministic matching facts (never produced or changed by the LLM). */
  fit: TeamView;
  messages: ChatMessage[];
  kickoff: KickoffRecord | null;
};

export type WorkspaceAccess =
  | { ok: true; workspace: Workspace }
  | { ok: false; reason: "not_found" | "not_member" | "not_active"; teamName?: string; status?: TeamStatus };

type ProfileRow = {
  id: string; display_name: string; is_synthetic: boolean; skills: string[]; roles: string[]; interests: string[];
  experience: string | null; working_style: Person["style"] | null; availability: number[]; timezone: string | null;
};
type PartRow = { user_id: string; goal: string | null; desired_roles: string[]; topics: string[]; availability_override: number[] | null };

/**
 * Loads the team workspace through RLS as the signed-in user. Chat/kickoff rows
 * are only readable by ACCEPTED members of an ACTIVE team (PostgreSQL policy);
 * the checks here only choose which message to show.
 */
export async function loadWorkspace(teamId: string, userId: string, opts: { messages?: boolean } = {}): Promise<WorkspaceAccess> {
  const supabase = await createClient();
  const { data: team } = await supabase
    .from("teams")
    .select("id, name, description, status, target_size, requirements, activation_mode, space:matching_spaces(id, slug, title, type)")
    .eq("id", teamId)
    .maybeSingle();
  if (!team || !team.space) return { ok: false, reason: "not_found" };

  const { data: rows } = await supabase
    .from("team_members")
    .select("user_id, role, joined_at")
    .eq("team_id", teamId)
    .eq("status", "active")
    .order("joined_at");
  const memberRows = rows ?? [];
  if (!memberRows.some((m) => m.user_id === userId)) return { ok: false, reason: "not_member", teamName: team.name, status: team.status };
  if (team.status !== "active") return { ok: false, reason: "not_active", teamName: team.name, status: team.status };

  const ids = memberRows.map((m) => m.user_id);
  const [profiles, parts] = await Promise.all([
    supabase.from("profiles").select("id, display_name, is_synthetic, skills, roles, interests, experience, working_style, availability, timezone").in("id", ids),
    supabase.from("participations").select("user_id, goal, desired_roles, topics, availability_override").eq("space_id", team.space.id).in("user_id", ids),
  ]);
  const pById = new Map(((profiles.data ?? []) as unknown as ProfileRow[]).map((p) => [p.id, p]));
  const paById = new Map(((parts.data ?? []) as unknown as PartRow[]).map((p) => [p.user_id, p]));

  const people: Person[] = ids.flatMap((id) => {
    const p = pById.get(id);
    if (!p) return [];
    const pa = paById.get(id);
    return [{
      id,
      name: p.display_name,
      synthetic: p.is_synthetic,
      skills: p.skills ?? [],
      roles: pa?.desired_roles?.length ? pa.desired_roles : (p.roles ?? []),
      interests: pa?.topics?.length ? pa.topics : (p.interests ?? []),
      experience: p.experience,
      style: p.working_style ?? {},
      availability: pa?.availability_override ?? p.availability ?? [],
      goal: pa?.goal ?? null,
    }];
  });

  const r = (team.requirements ?? {}) as TeamRequirements;
  const type = team.space.type as SpaceType;
  const needs: Needs = {
    spaceType: type,
    mustRoles: r.must_roles ?? [],
    preferredRoles: r.preferred_roles ?? [],
    defaultRoles: defaultRolesFor(type, team.target_size),
    skills: r.skills ?? [],
    topics: r.topics ?? [],
    goal: r.goal ?? null,
    minSharedHours: r.min_shared_hours ?? null,
    hardRoles: false,
    hardHours: false,
  };
  const ctx = buildContext(people, needs, PRESETS[defaultPreset(type)].weights);
  const viewerTz = pById.get(userId)?.timezone ?? "America/Los_Angeles";
  const fit = toTeamView(ctx, evaluate(ctx, people.map((p) => p.id)), people.map((p) => p.id), "", viewerTz);

  const [msgs, kick] = await Promise.all([
    opts.messages === false
      ? Promise.resolve({ data: [] as ChatMessage[] })
      : supabase.from("messages").select("id, author_id, body, client_id, created_at").eq("team_id", teamId).order("created_at", { ascending: false }).limit(100),
    supabase.from("kickoff_briefs").select("id, brief, source, created_at, generated_by").eq("team_id", teamId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const ownerId = memberRows.find((m) => m.role === "owner")?.user_id;
  return {
    ok: true,
    workspace: {
      team: {
        id: team.id, name: team.name, description: team.description, status: team.status, targetSize: team.target_size,
        requirements: r, activationMode: team.activation_mode,
      },
      space: { id: team.space.id, slug: team.space.slug, title: team.space.title, type },
      members: people.map((p) => {
        const v = fit.members.find((m) => m.id === p.id);
        return {
          id: p.id, name: p.name, synthetic: p.synthetic, owner: p.id === ownerId, roles: v?.roles ?? [], skills: v?.skills ?? [],
          skillIds: p.skills, interestIds: p.interests, goal: p.goal, experience: p.experience,
        };
      }),
      fit,
      messages: ((msgs.data ?? []) as ChatMessage[]).reverse(),
      kickoff: (kick.data as KickoffRecord | null) ?? null,
    },
  };
}

export type { Supabase };
