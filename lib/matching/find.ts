import "server-only";
import { fromDbError } from "@/lib/api/errors";
import type { createClient } from "@/lib/supabase/server";
import { SKILLS, roleLabel, type SpaceType } from "@/lib/taxonomy";
import type { TeamRequirements } from "@/lib/validation/team";
import { PRESETS, band, buildContext, defaultPreset, defaultRolesFor, growRecommendations, type Needs } from "./engine";
import { toPerson, type RawPerson } from "./service";

type Supabase = Awaited<ReturnType<typeof createClient>>;

type RawTeam = {
  id: string; name: string; description: string | null; status: string; target_size: number; members: number;
  reserved: number; open_positions: number; requirements: TeamRequirements; created_at: string;
  shared_hours: number | null; hidden_members: number;
  member_profiles: (RawPerson & { team_role: "owner" | "member" })[];
  my_request: { id: string; expires_at: string } | null;
  my_invite: { id: string; expires_at: string } | null;
};
type RawFind = {
  space: { id: string; type: SpaceType; min_team_size: number; max_team_size: number; status: string; team_deadline_at: string | null };
  me: RawPerson;
  on_team: boolean;
  total_recruiting: number;
  teams: RawTeam[];
};

export type FindFilters = { q?: string; roles?: string[]; skills?: string[]; topics?: string[]; goal?: string; min_shared_hours?: number };

export type FoundTeam = {
  id: string;
  name: string;
  description: string | null;
  members: number;
  targetSize: number;
  openPositions: number;
  requirements: TeamRequirements;
  createdAt: string;
  sharedHours: number | null;
  hiddenMembers: number;
  people: { id: string; name: string; synthetic: boolean; owner: boolean; roles: string[] }[];
  myRequest: RawTeam["my_request"];
  myInvite: RawTeam["my_invite"];
  /** How well the team would fit WITH you (whole-team score after you join). Null if no member shared a profile. */
  fit: null | { score: number; band: string; gain: number; fillsRoles: { role: string; must: boolean }[]; addsSkills: string[] };
};

/**
 * Find a Team. PostgreSQL filters (Space, scope, recruiting, free seats, text,
 * roles, skills, interests, goal, shared hours) and returns only consenting
 * members' features; the deterministic engine then scores "you + this team".
 */
export async function findTeams(supabase: Supabase, spaceId: string, filters: FindFilters) {
  const { data, error } = await supabase.rpc("find_teams", { p_space_id: spaceId, p_filters: filters });
  if (error) throw fromDbError(error);
  const raw = data as unknown as RawFind;
  const me = toPerson(raw.me);
  const preset = PRESETS[defaultPreset(raw.space.type)];

  const teams: FoundTeam[] = raw.teams.map((t) => {
    const people = t.member_profiles.map(toPerson);
    let fit: FoundTeam["fit"] = null;
    if (people.length > 0) {
      const r = t.requirements ?? {};
      const needs: Needs = {
        spaceType: raw.space.type,
        mustRoles: r.must_roles ?? [],
        preferredRoles: r.preferred_roles ?? [],
        defaultRoles: defaultRolesFor(raw.space.type, t.target_size),
        skills: r.skills ?? [],
        topics: r.topics ?? [],
        goal: r.goal ?? null,
        minSharedHours: r.min_shared_hours ?? null,
        hardRoles: false,
        hardHours: false,
      };
      const ctx = buildContext([...people, me], needs, preset.weights);
      const g = growRecommendations(ctx, people.map((p) => p.id), [me.id], 1).candidates[0];
      if (g) {
        fit = {
          score: Math.round(g.after.total * 1000) / 1000,
          band: band(g.after.total),
          gain: Math.round(g.gain * 1000) / 1000,
          fillsRoles: g.fillsRoles.map((f) => ({ role: roleLabel(f.role), must: f.level === "must" })),
          addsSkills: g.addsSkills.map((s) => SKILLS.find((k) => k.id === s)?.label ?? s),
        };
      }
    }
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      members: t.members,
      targetSize: t.target_size,
      openPositions: t.open_positions,
      requirements: t.requirements ?? {},
      createdAt: t.created_at,
      sharedHours: t.shared_hours,
      hiddenMembers: t.hidden_members,
      people: t.member_profiles.map((m) => ({
        id: m.id, name: m.name, synthetic: m.synthetic, owner: m.team_role === "owner",
        roles: (m.desired_roles?.length ? m.desired_roles : m.profile_roles ?? []).map(roleLabel),
      })),
      myRequest: t.my_request,
      myInvite: t.my_invite,
      fit,
    };
  });
  return { space: raw.space, onTeam: raw.on_team, totalRecruiting: raw.total_recruiting, teams };
}

export type FindSort = "recommended" | "newest" | "open";
export function sortTeams(teams: FoundTeam[], sort: FindSort): FoundTeam[] {
  const byId = (a: FoundTeam, b: FoundTeam) => (a.id < b.id ? -1 : 1);
  const copy = [...teams];
  if (sort === "newest") return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || byId(a, b));
  if (sort === "open") return copy.sort((a, b) => b.openPositions - a.openPositions || byId(a, b));
  // Recommended for you: best whole-team fit with you first; teams without shared profiles last.
  return copy.sort((a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1) || (b.fit?.gain ?? 0) - (a.fit?.gain ?? 0) || byId(a, b));
}
