import "server-only";
import { z } from "zod";
import { ApiError, fromDbError } from "@/lib/api/errors";
import type { createClient } from "@/lib/supabase/server";
import { INTERESTS, ROLES, SKILLS, roleLabel, type SpaceType } from "@/lib/taxonomy";
import { enumList, tagList } from "@/lib/validation/common";
import type { TeamRequirements } from "@/lib/validation/team";
import {
  ALGORITHM_VERSION, PRESETS, buildContext, defaultPreset, defaultRolesFor, formTeam, growRecommendations, replaceOptions,
  type Needs, type Person, type PresetKey,
} from "./engine";
import { roundParts, toTeamView, type TeamView } from "./view";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type RawPerson = {
  id: string; name: string; synthetic: boolean; skills: string[]; profile_roles: string[]; desired_roles: string[];
  interests: string[]; topics: string[]; experience: string | null; working_style: Person["style"] | null;
  availability: number[]; goal: string | null; timezone?: string;
};
type RawPool = {
  space: { id: string; type: SpaceType; min_team_size: number; max_team_size: number };
  me: RawPerson;
  team: null | {
    id: string; name: string; status: string; recruiting: boolean; target_size: number;
    requirements: TeamRequirements; pending_invites: number; members: RawPerson[];
  };
  candidates: RawPerson[];
  funnel: { others: number; on_a_team: number; eligible: number };
};

export const toPerson = (r: RawPerson): Person => ({
  id: r.id,
  name: r.name,
  synthetic: r.synthetic,
  skills: r.skills ?? [],
  roles: r.desired_roles?.length ? r.desired_roles : (r.profile_roles ?? []),
  interests: r.topics?.length ? r.topics : (r.interests ?? []),
  experience: r.experience,
  style: r.working_style ?? {},
  availability: r.availability ?? [],
  goal: r.goal,
});

export type Pool = {
  space: RawPool["space"];
  me: Person;
  timeZone: string;
  team: null | (Omit<NonNullable<RawPool["team"]>, "members"> & { members: Person[] });
  candidates: Person[];
  funnel: RawPool["funnel"];
};

/**
 * Loads the matching pool through get_match_pool (PostgreSQL enforces Space,
 * scope, consent, membership and recruiter authorization). Called on EVERY
 * matching request, so each step re-validates eligibility.
 */
export async function loadPool(supabase: Supabase, spaceId: string, teamId?: string | null): Promise<Pool> {
  const { data, error } = await supabase.rpc("get_match_pool", { p_space_id: spaceId, p_team_id: teamId ?? undefined });
  if (error) throw fromDbError(error);
  const raw = data as unknown as RawPool;
  return {
    space: raw.space,
    me: toPerson(raw.me),
    timeZone: raw.me.timezone ?? "America/Los_Angeles",
    team: raw.team ? { ...raw.team, members: raw.team.members.map(toPerson) } : null,
    candidates: raw.candidates.map(toPerson),
    funnel: raw.funnel,
  };
}

const knownSkill = new Set(SKILLS.map((s) => s.id));
const knownInterest = new Set(INTERESTS.map((i) => i.id));

export const matchParamsSchema = z.object({
  team_id: z.uuid().nullish(),
  team_size: z.number().int().min(2).max(20).optional(),
  preset: z.enum(Object.keys(PRESETS) as [PresetKey, ...PresetKey[]]).optional(),
  must_roles: enumList(ROLES.map((r) => r.id).filter((r) => r !== "flexible"), 6).default([]),
  skills: tagList(20, (s) => knownSkill.has(s)).default([]),
  topics: tagList(10, (t) => knownInterest.has(t)).default([]),
  min_shared_hours: z.number().int().min(0).max(40).nullish(),
  strict: z.boolean().default(false),
  exclude_ids: z.array(z.uuid()).max(60).default([]),
});
export type MatchParams = z.output<typeof matchParamsSchema>;

export const replaceParamsSchema = matchParamsSchema.extend({
  member_ids: z.array(z.uuid()).min(1).max(19),
  remove_id: z.uuid(),
});

type Setup = {
  pool: Pool;
  needs: Needs;
  preset: PresetKey;
  fixedIds: string[];
  poolIds: string[];
  slots: number;
  targetSize: number;
  ctx: ReturnType<typeof buildContext>;
};

function setup(pool: Pool, params: MatchParams): Setup {
  const { space, team } = pool;
  const minTarget = Math.max(space.min_team_size, 2);
  let needs: Needs;
  let fixed: Person[];
  let targetSize: number;

  if (team) {
    // Existing team: accepted members are fixed; requirements come from the team itself.
    const r = team.requirements ?? {};
    fixed = team.members;
    targetSize = team.target_size;
    needs = {
      spaceType: space.type,
      mustRoles: r.must_roles ?? [],
      preferredRoles: r.preferred_roles ?? [],
      defaultRoles: defaultRolesFor(space.type, targetSize),
      skills: r.skills ?? [],
      topics: r.topics ?? [],
      goal: r.goal ?? null,
      minSharedHours: r.min_shared_hours ?? null,
      hardRoles: params.strict,
      hardHours: params.strict,
    };
  } else {
    fixed = [pool.me];
    targetSize = Math.min(Math.max(params.team_size ?? Math.min(4, space.max_team_size), minTarget), space.max_team_size);
    needs = {
      spaceType: space.type,
      mustRoles: params.must_roles,
      preferredRoles: [],
      defaultRoles: defaultRolesFor(space.type, targetSize),
      skills: params.skills,
      topics: params.topics,
      goal: null,
      minSharedHours: params.min_shared_hours ?? null,
      hardRoles: params.strict,
      hardHours: params.strict,
    };
  }

  const exclude = new Set(params.exclude_ids);
  const candidates = pool.candidates.filter((c) => !exclude.has(c.id));
  const preset = params.preset ?? defaultPreset(space.type);
  // Capacity: never propose more people than open positions (accepted + pending count against the target).
  const slots = Math.max(targetSize - fixed.length - (team?.pending_invites ?? 0), 0);
  return {
    pool,
    needs,
    preset,
    fixedIds: fixed.map((p) => p.id),
    poolIds: candidates.map((c) => c.id),
    slots,
    targetSize,
    ctx: buildContext([...fixed, ...candidates], needs, PRESETS[preset].weights),
  };
}

const meta = (s: Setup) => ({
  algorithm: ALGORITHM_VERSION,
  preset: s.preset,
  preset_label: PRESETS[s.preset].label,
  weights: PRESETS[s.preset].weights,
  target_size: s.targetSize,
  open_slots: s.slots,
  funnel: { ...s.pool.funnel, considered: s.poolIds.length },
  team: s.pool.team ? { id: s.pool.team.id, name: s.pool.team.name } : null,
});

export type FormResponse = ReturnType<typeof meta> & {
  status: "ok" | "no_candidates" | "not_enough_candidates" | "infeasible" | "team_full";
  message: string | null;
  suggestions: string[];
  proposals: TeamView[];
  baseline: null | { score: number; roleCoverage: number; sharedHours: number; team: TeamView };
  comparison: null | { score: number; roleCoverage: number; sharedHours: number };
  search: { method: string; evaluations: number; shortlist: number };
};

export function formProposal(pool: Pool, params: MatchParams): FormResponse {
  const s = setup(pool, params);
  const view = (e: Parameters<typeof toTeamView>[1]) => toTeamView(s.ctx, e, s.fixedIds, pool.me.id, pool.timeZone);
  if (s.slots === 0) {
    return {
      ...meta(s), status: "team_full", message: "This team has no open positions. Add open positions on the team page to get recommendations.",
      suggestions: [], proposals: [], baseline: null, comparison: null, search: { method: "none", evaluations: 0, shortlist: 0 },
    };
  }
  const r = formTeam(s.ctx, s.fixedIds, s.poolIds, s.slots);
  const { others, on_a_team, eligible } = pool.funnel;
  let message: string | null = null;
  const suggestions: string[] = [];
  if (r.status === "no_candidates") {
    message =
      others === 0
        ? "No matches yet: you're the only participant in this Space."
        : `No matches yet: none of the other ${others} participant${others === 1 ? "" : "s"} can be suggested right now.`;
    if (on_a_team) suggestions.push(`${on_a_team} already ${on_a_team === 1 ? "is" : "are"} on a team.`);
    if (others - on_a_team - eligible > 0) suggestions.push(`${others - on_a_team - eligible} haven't turned on visibility, invitations and AI suggestions.`);
    suggestions.push("Share the Space link so more students join, then try again.");
    if (params.exclude_ids.length) suggestions.push("Clear your excluded candidates.");
  } else if (r.status === "infeasible") {
    message = "No team satisfies the requirements you marked as strict.";
    if (r.unavailableRoles.length) suggestions.push(`No eligible student lists ${r.unavailableRoles.map(roleLabel).join(", ")}: make ${r.unavailableRoles.length > 1 ? "them" : "it"} optional.`);
    if (s.needs.minSharedHours) suggestions.push(`Lower the minimum shared hours (currently ${s.needs.minSharedHours}).`);
    suggestions.push("Turn off “strict requirements” to see the closest team and its gaps.");
  } else if (r.status === "not_enough_candidates") {
    message = `Only ${r.poolSize} eligible candidate${r.poolSize === 1 ? "" : "s"} for ${s.slots} open position${s.slots === 1 ? "" : "s"}, so this proposal is smaller than requested.`;
    suggestions.push("Share the Space link so more students join.");
  }
  const best = r.teams[0];
  return {
    ...meta(s),
    status: r.status,
    message,
    suggestions,
    proposals: r.teams.map(view),
    baseline: r.baseline && best
      ? { score: round3(r.baseline.total), roleCoverage: round2(r.baseline.roleCoverage), sharedHours: r.baseline.sharedHours, team: view(r.baseline) }
      : null,
    comparison: best ? { score: round3(best.total), roleCoverage: round2(best.roleCoverage), sharedHours: best.sharedHours } : null,
    search: { method: r.method, evaluations: r.evaluations, shortlist: r.shortlist },
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Validates that a client-supplied composition only contains currently eligible candidates. */
function validateComposition(s: Setup, memberIds: string[]) {
  const unique = [...new Set(memberIds)];
  const eligible = new Set(s.poolIds);
  if (unique.some((id) => !eligible.has(id))) {
    throw new ApiError("INVITE_NO_LONGER_VALID", "Someone in this proposal is no longer eligible. Generate a new team.");
  }
  if (unique.length > s.slots) throw new ApiError("TEAM_FULL", "This proposal has more people than open positions.");
  return unique;
}

export function replaceCandidate(pool: Pool, params: z.output<typeof replaceParamsSchema>) {
  const s = setup(pool, params);
  if (s.fixedIds.includes(params.remove_id)) {
    throw new ApiError("INVALID_INPUT", "Accepted team members can't be replaced here.");
  }
  const ids = validateComposition(s, params.member_ids);
  if (!ids.includes(params.remove_id)) throw new ApiError("INVALID_INPUT", "That person is not in this proposal.");
  const { current, options } = replaceOptions(s.ctx, s.fixedIds, ids, params.remove_id, s.poolIds);
  const view = (e: Parameters<typeof toTeamView>[1]) => toTeamView(s.ctx, e, s.fixedIds, pool.me.id, pool.timeZone);
  return {
    ...meta(s),
    current: view(current),
    removed: { id: params.remove_id, name: s.ctx.byId.get(params.remove_id)!.p.name },
    options: options.map((o) => {
      const team = view(o.evaluation);
      return {
        candidate: team.members.find((m) => m.id === o.id)!,
        delta: round3(o.delta),
        part_deltas: roundParts(o.partDeltas),
        team,
      };
    }),
  };
}

export function recommendMembers(pool: Pool, params: MatchParams) {
  if (!pool.team) throw new ApiError("INVALID_INPUT", "Choose one of your teams.");
  const s = setup(pool, params);
  const { current, candidates } = growRecommendations(s.ctx, s.fixedIds, s.poolIds);
  const view = (e: Parameters<typeof toTeamView>[1]) => toTeamView(s.ctx, e, s.fixedIds, pool.me.id, pool.timeZone);
  const currentView = view(current);
  return {
    ...meta(s),
    current: currentView,
    missing: {
      must_roles: currentView.roles.filter((r) => r.level === "must" && r.status === "missing").map((r) => r.role),
      preferred_roles: currentView.roles.filter((r) => r.level !== "must" && r.status === "missing").map((r) => r.role),
      skills: currentView.skillsMissing,
      shared_hours: { have: current.sharedHours, target: current.targetHours, short: current.sharedHours < current.targetHours },
    },
    // Recommendations are only meaningful while there is room on the team.
    candidates: s.slots === 0 ? [] : candidates.map((c) => {
      const after = view(c.after);
      return {
        candidate: after.members.find((m) => m.id === c.id)!,
        gain: round3(c.gain),
        score_after: round3(c.after.total),
        part_deltas: roundParts(c.partDeltas),
        fills_roles: c.fillsRoles.map((f) => ({ role: roleLabel(f.role), level: f.level })),
        adds_skills: c.addsSkills.map((x) => SKILLS.find((k) => k.id === x)?.label ?? x),
        shared_hours_after: c.after.sharedHours,
      };
    }),
  };
}
export type RecommendResponse = ReturnType<typeof recommendMembers>;
export type ReplaceResponse = ReturnType<typeof replaceCandidate>;
