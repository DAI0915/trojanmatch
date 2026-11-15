/**
 * TrojanMatch matching engine — pure, deterministic, no I/O, no randomness.
 *
 * Team Fit(T) = Σ wᵢ · componentᵢ(T), every component normalized to [0, 1]:
 *
 *   skill    = 0.7 · roleCoverage + 0.3 · skillScore
 *   goal     = mean pairwise goal compatibility (+ team goal anchor)
 *   interest = mean pairwise weighted overlap of interest tags (+ team topics anchor)
 *   schedule = min(1, hours/week when EVERYONE is free ÷ target hours)
 *   style    = mean pairwise working-style compatibility
 *
 * Consent, Space, scope, membership and capacity are NOT handled here: they are
 * hard constraints enforced in PostgreSQL (get_match_pool) before this code
 * ever sees a candidate. The weights are documented heuristics, not validated
 * predictors of team success.
 */
import { INTERESTS, SKILLS, type SpaceType } from "@/lib/taxonomy";

export const ALGORITHM_VERSION = "tm-match-1.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Person = {
  id: string;
  name: string;
  synthetic: boolean;
  skills: string[];
  /** Roles for THIS Space (participation.desired_roles, else profile roles). */
  roles: string[];
  /** Topics for THIS Space (participation.topics, else profile interests). */
  interests: string[];
  experience: string | null;
  style: { sync?: string; planning?: string; comm?: string };
  /** UTC hour-of-week indices (0–167). */
  availability: number[];
  goal: string | null;
};

export type Needs = {
  spaceType: SpaceType;
  mustRoles: string[];
  preferredRoles: string[];
  /** Used only when no must/preferred roles are given. */
  defaultRoles: string[];
  skills: string[];
  topics: string[];
  goal: string | null;
  minSharedHours: number | null;
  /** Treat must roles / minimum hours as hard feasibility rules for complete teams. */
  hardRoles: boolean;
  hardHours: boolean;
};

export type Weights = { skill: number; goal: number; interest: number; schedule: number; style: number };
export type PartKey = keyof Weights;
export const PART_KEYS: PartKey[] = ["skill", "goal", "interest", "schedule", "style"];

export const PRESETS: Record<string, { label: string; weights: Weights }> = {
  balanced: { label: "Balanced skills", weights: { skill: 0.3, goal: 0.25, interest: 0.2, schedule: 0.15, style: 0.1 } },
  course: { label: "Course project", weights: { skill: 0.25, goal: 0.25, interest: 0.1, schedule: 0.25, style: 0.15 } },
  interests: { label: "Shared interests", weights: { skill: 0.2, goal: 0.2, interest: 0.4, schedule: 0.1, style: 0.1 } },
  schedule: { label: "Schedule", weights: { skill: 0.2, goal: 0.2, interest: 0.1, schedule: 0.4, style: 0.1 } },
  goals: { label: "Similar goals", weights: { skill: 0.2, goal: 0.4, interest: 0.15, schedule: 0.15, style: 0.1 } },
};
export type PresetKey = keyof typeof PRESETS;
export const defaultPreset = (type: SpaceType): PresetKey => (type === "course" ? "course" : "balanced");

const DEFAULT_ROLE_MIX: Record<SpaceType, string[]> = {
  hackathon: ["backend", "frontend", "ai_ml", "design", "pm_pitch"],
  course: ["backend", "data", "writing", "research"],
};
export function defaultRolesFor(type: SpaceType, teamSize: number): string[] {
  return DEFAULT_ROLE_MIX[type].slice(0, Math.max(2, Math.min(teamSize, DEFAULT_ROLE_MIX[type].length)));
}
export const DEFAULT_TARGET_HOURS: Record<SpaceType, number> = { hackathon: 6, course: 8 };

const GOAL_ORDER: Record<SpaceType, string[]> = {
  hackathon: ["learn", "build", "competitive"],
  course: ["meet_requirements", "learn_deeply", "aim_a"],
};

const SKILL_GROUP = new Map(SKILLS.map((s) => [s.id, s.group]));
export const SKILL_GROUPS = [...new Set(SKILLS.map((s) => s.group))];
const INTEREST_GROUP = new Map(INTERESTS.map((i) => [i.id, i.group]));

export type RoleTarget = { role: string; level: "must" | "preferred" | "default"; weight: number };

export type Parts = Record<PartKey, number>;
export type FastScore = { total: number; parts: Parts; roleCoverage: number; skillScore: number; sharedHours: number; feasible: boolean };

export type RoleStatus = {
  role: string;
  level: RoleTarget["level"];
  /** covered = a dedicated member; partial = someone can cover it on the side / a flexible member; missing = nobody. */
  status: "covered" | "partial" | "missing";
  by: string | null; // person id
};

export type Evaluation = FastScore & {
  memberIds: string[];
  roles: RoleStatus[];
  /** person id → suggested primary role for this team (or null). */
  assignment: Record<string, string | null>;
  skillsCovered: string[];
  skillsMissing: string[];
  skillGroupsCovered: string[];
  usingDefaultRoles: boolean;
  targetHours: number;
  sharedHourList: number[]; // UTC hour-of-week
  violations: string[];
  goalCounts: Record<string, number>;
  sharedTopics: { tag: string; count: number }[];
};

// ---------------------------------------------------------------------------
// Context (precomputed features; all lookups are O(1) during search)
// ---------------------------------------------------------------------------
type Prepared = {
  p: Person;
  idx: number;
  roleBits: number; // over ctx.targets
  flexible: boolean;
  skillBits: number; // over ctx.needs.skills (≤ 20)
  groupBits: number; // over SKILL_GROUPS
  avail: Int32Array; // 6 × 28 bits = 168 hours
  goalToTeam: number;
  topicToTeam: number;
};

export type Context = {
  needs: Needs;
  weights: Weights;
  targets: RoleTarget[];
  targetWeightSum: number;
  usingDefaultRoles: boolean;
  targetHours: number;
  people: Prepared[];
  byId: Map<string, Prepared>;
  goalPair: Float64Array;
  interestPair: Float64Array;
  stylePair: Float64Array;
  n: number;
};

const WORDS = 6;
const BITS = 28;
function toBits(hours: number[]): Int32Array {
  const a = new Int32Array(WORDS);
  for (const h of hours) if (h >= 0 && h < 168) a[Math.floor(h / BITS)] |= 1 << (h % BITS);
  return a;
}
function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function goalCompat(type: SpaceType, a: string | null, b: string | null): number {
  if (!a || !b) return 0.5; // unknown: neutral
  const ia = GOAL_ORDER[type].indexOf(a);
  const ib = GOAL_ORDER[type].indexOf(b);
  if (ia < 0 || ib < 0) return 0.5;
  const d = Math.abs(ia - ib);
  return d === 0 ? 1 : d === 1 ? 0.6 : 0.2;
}

/** Tags weigh 1, their taxonomy group 0.5. Overlap coefficient in [0,1]; 0.5 when either side is empty. */
function expandInterests(tags: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tags) {
    m.set(`t:${t}`, 1);
    const g = INTEREST_GROUP.get(t);
    if (g) m.set(`g:${g}`, 0.5);
  }
  return m;
}
function weightSum(m: Map<string, number>) {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}
export function interestSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0.5;
  const ea = expandInterests(a);
  const eb = expandInterests(b);
  let inter = 0;
  for (const [k, w] of ea) if (eb.has(k)) inter += w;
  return inter / Math.min(weightSum(ea), weightSum(eb));
}

const COMM_ORDER = ["daily", "few_times_week", "weekly"];
export function styleCompat(a: Person["style"], b: Person["style"]): number {
  const dim = (x?: string, y?: string, ordinal = false) => {
    if (!x || !y) return 0.5;
    if (x === y) return 1;
    if (ordinal) return Math.abs(COMM_ORDER.indexOf(x) - COMM_ORDER.indexOf(y)) === 1 ? 0.6 : 0.25;
    return x === "mixed" || y === "mixed" ? 0.75 : 0.25;
  };
  return (dim(a.sync, b.sync) + dim(a.planning, b.planning) + dim(a.comm, b.comm, true)) / 3;
}

export function buildContext(people: Person[], needs: Needs, weights: Weights): Context {
  const seen = new Set<string>();
  const unique = people.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  // Canonical order → identical results regardless of input order.
  unique.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const targets: RoleTarget[] = [];
  const add = (role: string, level: RoleTarget["level"], weight: number) => {
    if (role !== "flexible" && !targets.some((t) => t.role === role) && targets.length < 8) targets.push({ role, level, weight });
  };
  needs.mustRoles.forEach((r) => add(r, "must", 2));
  needs.preferredRoles.forEach((r) => add(r, "preferred", 1));
  const usingDefaultRoles = targets.length === 0;
  if (usingDefaultRoles) needs.defaultRoles.forEach((r) => add(r, "default", 1));

  const skills = needs.skills.slice(0, 20);
  const prepared: Prepared[] = unique.map((p, idx) => {
    let roleBits = 0;
    targets.forEach((t, i) => {
      if (p.roles.includes(t.role)) roleBits |= 1 << i;
    });
    let skillBits = 0;
    skills.forEach((s, i) => {
      if (p.skills.includes(s)) skillBits |= 1 << i;
    });
    let groupBits = 0;
    for (const s of p.skills) {
      const g = SKILL_GROUP.get(s);
      if (g) groupBits |= 1 << SKILL_GROUPS.indexOf(g);
    }
    return {
      p,
      idx,
      roleBits,
      flexible: p.roles.includes("flexible"),
      skillBits,
      groupBits,
      avail: toBits(p.availability),
      goalToTeam: needs.goal ? goalCompat(needs.spaceType, p.goal, needs.goal) : 0,
      topicToTeam: needs.topics.length ? interestSimilarity(p.interests, needs.topics) : 0,
    };
  });

  const n = prepared.length;
  const goalPair = new Float64Array(n * n);
  const interestPair = new Float64Array(n * n);
  const stylePair = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = prepared[i].p;
      const b = prepared[j].p;
      goalPair[i * n + j] = goalPair[j * n + i] = goalCompat(needs.spaceType, a.goal, b.goal);
      interestPair[i * n + j] = interestPair[j * n + i] = interestSimilarity(a.interests, b.interests);
      stylePair[i * n + j] = stylePair[j * n + i] = styleCompat(a.style, b.style);
    }
  }

  return {
    needs: { ...needs, skills },
    weights,
    targets,
    targetWeightSum: targets.reduce((s, t) => s + t.weight, 0),
    usingDefaultRoles,
    targetHours: needs.minSharedHours && needs.minSharedHours > 0 ? needs.minSharedHours : DEFAULT_TARGET_HOURS[needs.spaceType],
    people: prepared,
    byId: new Map(prepared.map((x) => [x.p.id, x])),
    goalPair,
    interestPair,
    stylePair,
    n,
  };
}

// ---------------------------------------------------------------------------
// Role coverage: assign each member at most ONE primary role (complementarity).
//   credit(role) = 1    a dedicated member who lists the role
//                = 0.5  someone lists it but is dedicated elsewhere, or a
//                       dedicated "flexible" member fills it
//                = 0    nobody can cover it
// Maximized exactly with a DP over role subsets (≤ 8 target roles).
// ---------------------------------------------------------------------------
function roleCoverage(ctx: Context, team: Prepared[], wantAssignment: boolean) {
  const T = ctx.targets.length;
  if (T === 0) return { coverage: 1, assigned: new Map<number, number>() };
  let listed = 0;
  for (const m of team) listed |= m.roleBits;

  const size = 1 << T;
  let dp = new Float64Array(size).fill(-1);
  // Tie-break between equally good assignments: prefer members in roles they actually
  // list over "flexible" stand-ins (affects only the displayed assignment, never the score).
  let real = new Int8Array(size);
  dp[0] = 0;
  const choice: Int16Array[] = [];
  for (const m of team) {
    const next = new Float64Array(dp); // member left unassigned
    const nextReal = new Int8Array(real);
    const ch = wantAssignment ? new Int16Array(size).fill(-1) : null;
    for (let mask = 0; mask < size; mask++) {
      const base = dp[mask];
      if (base < 0) continue;
      for (let r = 0; r < T; r++) {
        const bit = 1 << r;
        if (mask & bit) continue;
        let gain = 0;
        const lists = (m.roleBits & bit) !== 0;
        if (lists) gain = 0.5 * ctx.targets[r].weight; // 0.5 (listed) → 1 (dedicated)
        else if (m.flexible && !(listed & bit)) gain = 0.5 * ctx.targets[r].weight; // 0 → 0.5
        else continue;
        const v = base + gain;
        const nm = mask | bit;
        const nr = real[mask] + (lists ? 1 : 0);
        if (v > next[nm] + 1e-12 || (Math.abs(v - next[nm]) <= 1e-12 && nr > nextReal[nm])) {
          next[nm] = v;
          nextReal[nm] = nr;
          if (ch) ch[nm] = r;
        }
      }
    }
    dp = next;
    real = nextReal;
    if (ch) choice.push(ch);
  }
  let best = 0;
  let bestMask = 0;
  for (let mask = 0; mask < size; mask++) {
    if (dp[mask] > best + 1e-12 || (dp[mask] >= 0 && Math.abs(dp[mask] - best) <= 1e-12 && real[mask] > real[bestMask])) {
      best = dp[mask];
      bestMask = mask;
    }
  }
  let baseCredit = 0;
  for (let r = 0; r < T; r++) if (listed & (1 << r)) baseCredit += 0.5 * ctx.targets[r].weight;
  const coverage = (baseCredit + best) / ctx.targetWeightSum;

  // Reconstruct the optimal assignment by walking the DP choices backwards.
  const assigned = new Map<number, number>(); // member position → role index
  if (wantAssignment) {
    let mask = bestMask;
    for (let i = team.length - 1; i >= 0; i--) {
      const r = choice[i][mask];
      if (r >= 0) {
        assigned.set(i, r);
        mask ^= 1 << r;
      }
    }
  }
  return { coverage, assigned };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
function pairMean(matrix: Float64Array, n: number, team: Prepared[]): number {
  if (team.length < 2) return 0.5; // undefined for one person: neutral
  let s = 0;
  let c = 0;
  for (let i = 0; i < team.length; i++) {
    for (let j = i + 1; j < team.length; j++) {
      s += matrix[team[i].idx * n + team[j].idx];
      c++;
    }
  }
  return s / c;
}

function sharedHours(team: Prepared[]): number {
  let total = 0;
  for (let w = 0; w < WORDS; w++) {
    let x = team[0].avail[w];
    for (let i = 1; i < team.length; i++) x &= team[i].avail[w];
    total += popcount(x);
  }
  return total;
}

/** Hard feasibility for a COMPLETE team (only when the user/team marked rules as hard). */
function checkFeasible(ctx: Context, team: Prepared[], hours: number): string[] {
  const v: string[] = [];
  if (ctx.needs.hardRoles) {
    let listed = 0;
    let flex = 0;
    for (const m of team) {
      listed |= m.roleBits;
      if (m.flexible) flex++;
    }
    const missing = ctx.targets.filter((t, i) => t.level === "must" && !(listed & (1 << i)));
    if (missing.length > flex) v.push(`missing_role:${missing.map((m) => m.role).join(",")}`);
  }
  if (ctx.needs.hardHours && ctx.needs.minSharedHours && hours < ctx.needs.minSharedHours) {
    v.push(`shared_hours:${hours}<${ctx.needs.minSharedHours}`);
  }
  return v;
}

export function scoreTeam(ctx: Context, team: Prepared[]): FastScore {
  const { weights: w, needs } = ctx;
  const role = roleCoverage(ctx, team, false).coverage;

  let skillScore: number;
  if (needs.skills.length) {
    let bits = 0;
    for (const m of team) bits |= m.skillBits;
    skillScore = popcount(bits) / needs.skills.length;
  } else {
    let g = 0;
    for (const m of team) g |= m.groupBits;
    skillScore = popcount(g) / SKILL_GROUPS.length;
  }

  let goal = pairMean(ctx.goalPair, ctx.n, team);
  if (needs.goal) goal = 0.5 * goal + 0.5 * (team.reduce((s, m) => s + m.goalToTeam, 0) / team.length);
  let interest = pairMean(ctx.interestPair, ctx.n, team);
  if (needs.topics.length) interest = 0.5 * interest + 0.5 * (team.reduce((s, m) => s + m.topicToTeam, 0) / team.length);

  const hours = sharedHours(team);
  const parts: Parts = {
    skill: 0.7 * role + 0.3 * skillScore,
    goal,
    interest,
    schedule: Math.min(1, hours / ctx.targetHours),
    style: pairMean(ctx.stylePair, ctx.n, team),
  };
  const total = PART_KEYS.reduce((s, k) => s + w[k] * parts[k], 0);
  return { total, parts, roleCoverage: role, skillScore, sharedHours: hours, feasible: checkFeasible(ctx, team, hours).length === 0 };
}

export function members(ctx: Context, ids: string[]): Prepared[] {
  return ids.map((id) => {
    const m = ctx.byId.get(id);
    if (!m) throw new Error(`unknown member ${id}`);
    return m;
  });
}

export function evaluate(ctx: Context, ids: string[]): Evaluation {
  const team = members(ctx, [...new Set(ids)]);
  const fast = scoreTeam(ctx, team);
  const { assigned } = roleCoverage(ctx, team, true);

  let listed = 0;
  for (const m of team) listed |= m.roleBits;
  const dedicated = new Map<number, number>(); // role index → member position
  assigned.forEach((r, i) => dedicated.set(r, i));
  const roles: RoleStatus[] = ctx.targets.map((t, r) => {
    const pos = dedicated.get(r);
    if (pos !== undefined) {
      const m = team[pos];
      return { role: t.role, level: t.level, status: m.roleBits & (1 << r) ? "covered" : "partial", by: m.p.id };
    }
    if (listed & (1 << r)) {
      const m = team.find((x) => x.roleBits & (1 << r))!;
      return { role: t.role, level: t.level, status: "partial", by: m.p.id };
    }
    return { role: t.role, level: t.level, status: "missing", by: null };
  });
  const assignment: Record<string, string | null> = {};
  team.forEach((m, i) => {
    const r = assigned.get(i);
    assignment[m.p.id] = r === undefined ? null : ctx.targets[r].role;
  });

  const allSkills = new Set(team.flatMap((m) => m.p.skills));
  let g = 0;
  for (const m of team) g |= m.groupBits;

  const hourList: number[] = [];
  for (let h = 0; h < 168; h++) {
    const w = Math.floor(h / BITS);
    const bit = 1 << (h % BITS);
    if (team.every((m) => m.avail[w] & bit)) hourList.push(h);
  }

  const goalCounts: Record<string, number> = {};
  for (const m of team) if (m.p.goal) goalCounts[m.p.goal] = (goalCounts[m.p.goal] ?? 0) + 1;
  const topicCounts = new Map<string, number>();
  for (const m of team) for (const t of new Set(m.p.interests)) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  const sharedTopics = [...topicCounts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 4)
    .map(([tag, count]) => ({ tag, count }));

  return {
    ...fast,
    memberIds: team.map((m) => m.p.id),
    roles,
    assignment,
    skillsCovered: ctx.needs.skills.filter((s) => allSkills.has(s)),
    skillsMissing: ctx.needs.skills.filter((s) => !allSkills.has(s)),
    skillGroupsCovered: SKILL_GROUPS.filter((_, i) => g & (1 << i)),
    usingDefaultRoles: ctx.usingDefaultRoles,
    targetHours: ctx.targetHours,
    sharedHourList: hourList,
    violations: checkFeasible(ctx, team, fast.sharedHours),
    goalCounts,
    sharedTopics,
  };
}

export function band(total: number): "Strong" | "Good" | "Fair" | "Weak" {
  return total >= 0.75 ? "Strong" : total >= 0.6 ? "Good" : total >= 0.45 ? "Fair" : "Weak";
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
const EPS = 1e-9;
const SHORTLIST = 24;
const PER_ROLE_EXTRA = 3;
const EXHAUSTIVE_LIMIT = 25_000;
const BEAM_WIDTH = 64;
const KEEP_TOP = 400;

type Scored = { key: string; ids: string[]; total: number; feasible: boolean };
const better = (a: Scored, b: Scored) =>
  a.feasible !== b.feasible ? a.feasible : Math.abs(a.total - b.total) > EPS ? a.total > b.total : a.key < b.key;
const sortScored = (l: Scored[]) => l.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i;
  return Math.round(r);
}

export type Ranked = { id: string; total: number; gain: number };

/** Individual ranking: how much does each candidate, ALONE, improve the fixed members' team? */
export function rankIndividually(ctx: Context, fixedIds: string[], poolIds: string[]): Ranked[] {
  const fixed = members(ctx, fixedIds);
  const base = scoreTeam(ctx, fixed).total;
  return members(ctx, poolIds)
    .map((c) => {
      const total = scoreTeam(ctx, [...fixed, c]).total;
      return { id: c.p.id, total, gain: total - base };
    })
    .sort((a, b) => (Math.abs(a.total - b.total) > EPS ? b.total - a.total : a.id < b.id ? -1 : 1));
}

export type FormResult = {
  status: "ok" | "no_candidates" | "not_enough_candidates" | "infeasible";
  fixedIds: string[];
  slots: number;
  /** Best team first, then up to 2 structurally different alternatives. */
  teams: Evaluation[];
  baseline: Evaluation | null;
  method: "exhaustive" | "beam" | "none";
  evaluations: number;
  shortlist: number;
  poolSize: number;
  /** Must roles that no eligible candidate (or fixed member) lists at all. */
  unavailableRoles: string[];
};

/**
 * Whole-team optimization. Bounded and deterministic:
 *   1. shortlist = top 24 candidates by individual gain + best 3 per target role
 *   2. C(shortlist, slots) ≤ 25,000 → evaluate EVERY team; else beam search (width 64)
 *   3. ties → higher score, then lexicographically smaller sorted member ids
 */
export function formTeam(ctx: Context, fixedIds: string[], poolIds: string[], slots: number): FormResult {
  const fixedSet = new Set(fixedIds);
  const pool = [...new Set(poolIds)].filter((id) => !fixedSet.has(id) && ctx.byId.has(id));
  const fixed = members(ctx, fixedIds);
  const empty = (status: FormResult["status"]): FormResult => ({
    status, fixedIds, slots, teams: [], baseline: null, method: "none", evaluations: 0, shortlist: 0, poolSize: pool.length,
    unavailableRoles: unavailable(),
  });
  function unavailable() {
    const everyone = [...fixed, ...members(ctx, pool)];
    let listed = 0;
    let flex = false;
    for (const m of everyone) {
      listed |= m.roleBits;
      flex ||= m.flexible;
    }
    return flex ? [] : ctx.targets.filter((t, i) => t.level === "must" && !(listed & (1 << i))).map((t) => t.role);
  }
  if (slots <= 0) return { ...empty("ok"), teams: [evaluate(ctx, fixedIds)] };
  if (pool.length === 0) return empty("no_candidates");
  const k = Math.min(slots, pool.length);

  const ranked = rankIndividually(ctx, fixedIds, pool);
  const short = new Set(ranked.slice(0, SHORTLIST).map((r) => r.id));
  ctx.targets.forEach((_, i) => {
    let added = 0;
    for (const r of ranked) {
      if (added >= PER_ROLE_EXTRA) break;
      if (ctx.byId.get(r.id)!.roleBits & (1 << i)) {
        short.add(r.id);
        added++;
      }
    }
  });
  const cand = members(ctx, [...short].sort());
  let evaluations = ranked.length;
  let top: Scored[] = [];
  const push = (team: Prepared[]) => {
    const s = scoreTeam(ctx, team);
    evaluations++;
    const ids = team.slice(fixed.length).map((m) => m.p.id).sort();
    top.push({ key: ids.join("|"), ids, total: s.total, feasible: s.feasible });
    if (top.length > KEEP_TOP * 4) top = sortScored(top).slice(0, KEEP_TOP);
  };

  let method: FormResult["method"];
  if (choose(cand.length, k) <= EXHAUSTIVE_LIMIT) {
    method = "exhaustive";
    const cur: Prepared[] = [...fixed];
    const rec = (start: number, left: number) => {
      if (left === 0) return push(cur);
      for (let i = start; i <= cand.length - left; i++) {
        cur.push(cand[i]);
        rec(i + 1, left - 1);
        cur.pop();
      }
    };
    rec(0, k);
  } else {
    method = "beam";
    let beam: { ids: string[]; total: number }[] = [{ ids: [], total: 0 }];
    for (let depth = 0; depth < k; depth++) {
      const next = new Map<string, { ids: string[]; total: number }>();
      for (const b of beam) {
        const used = new Set(b.ids);
        for (const c of cand) {
          if (used.has(c.p.id)) continue;
          const ids = [...b.ids, c.p.id].sort();
          const key = ids.join("|");
          if (next.has(key)) continue;
          const s = scoreTeam(ctx, [...fixed, ...members(ctx, ids)]);
          evaluations++;
          next.set(key, { ids, total: s.total });
        }
      }
      beam = [...next.values()]
        .sort((a, b) => (Math.abs(a.total - b.total) > EPS ? b.total - a.total : a.ids.join("|") < b.ids.join("|") ? -1 : 1))
        .slice(0, BEAM_WIDTH);
    }
    for (const b of beam) push([...fixed, ...members(ctx, b.ids)]);
    // The individual-ranking baseline is always considered, so the result can never be worse than it.
    push([...fixed, ...members(ctx, ranked.slice(0, k).map((r) => r.id).sort())]);
  }

  top = sortScored(top);
  const baseline = evaluate(ctx, [...fixedIds, ...ranked.slice(0, k).map((r) => r.id)]);
  const feasible = top.filter((t) => t.feasible);
  if (feasible.length === 0) {
    return { ...empty("infeasible"), baseline, method, evaluations, shortlist: cand.length };
  }

  // Alternatives must differ from every chosen team in more than half of the open slots.
  const maxShared = Math.floor(k / 2);
  const chosen: Scored[] = [];
  for (const t of feasible) {
    if (chosen.length === 3) break;
    if (chosen.every((c) => t.ids.filter((id) => c.ids.includes(id)).length <= (chosen.length ? maxShared : k))) chosen.push(t);
  }

  return {
    status: k < slots ? "not_enough_candidates" : "ok",
    fixedIds,
    slots,
    teams: chosen.map((c) => evaluate(ctx, [...fixedIds, ...c.ids])),
    baseline,
    method,
    evaluations,
    shortlist: cand.length,
    poolSize: pool.length,
    unavailableRoles: unavailable(),
  };
}

export type Replacement = { id: string; evaluation: Evaluation; delta: number; partDeltas: Parts };

/** Swap ONE candidate and re-score the WHOLE team for every eligible alternative. */
export function replaceOptions(
  ctx: Context,
  fixedIds: string[],
  candidateIds: string[],
  removeId: string,
  poolIds: string[],
  limit = 5,
): { current: Evaluation; options: Replacement[] } {
  if (fixedIds.includes(removeId)) throw new Error("ACCEPTED_MEMBER");
  if (!candidateIds.includes(removeId)) throw new Error("NOT_IN_PROPOSAL");
  const current = evaluate(ctx, [...fixedIds, ...candidateIds]);
  const keep = candidateIds.filter((id) => id !== removeId);
  const taken = new Set([...fixedIds, ...candidateIds]);
  const scored = [...new Set(poolIds)]
    .filter((id) => !taken.has(id) && ctx.byId.has(id))
    .map((id) => {
      const s = scoreTeam(ctx, members(ctx, [...fixedIds, ...keep, id]));
      return { id, total: s.total, feasible: s.feasible };
    })
    .filter((s) => s.feasible)
    .sort((a, b) => (Math.abs(a.total - b.total) > EPS ? b.total - a.total : a.id < b.id ? -1 : 1))
    .slice(0, limit);
  return {
    current,
    options: scored.map((s) => {
      const evaluation = evaluate(ctx, [...fixedIds, ...keep, s.id]);
      return { id: s.id, evaluation, delta: evaluation.total - current.total, partDeltas: diffParts(evaluation.parts, current.parts) };
    }),
  };
}

export function diffParts(a: Parts, b: Parts): Parts {
  return { skill: a.skill - b.skill, goal: a.goal - b.goal, interest: a.interest - b.interest, schedule: a.schedule - b.schedule, style: a.style - b.style };
}

export type GrowCandidate = {
  id: string;
  after: Evaluation;
  gain: number;
  partDeltas: Parts;
  fillsRoles: { role: string; level: RoleTarget["level"] }[];
  addsSkills: string[];
};

/** Grow My Team: rank candidates by how much adding them improves the EXISTING team as a whole. */
export function growRecommendations(ctx: Context, teamIds: string[], poolIds: string[], limit = 8): { current: Evaluation; candidates: GrowCandidate[] } {
  const current = evaluate(ctx, teamIds);
  const team = members(ctx, teamIds);
  let listed = 0;
  for (const m of team) listed |= m.roleBits;
  const have = new Set(team.flatMap((m) => m.p.skills));
  const taken = new Set(teamIds);

  const candidates = [...new Set(poolIds)]
    .filter((id) => !taken.has(id) && ctx.byId.has(id))
    .map((id) => ({ id, total: scoreTeam(ctx, [...team, ctx.byId.get(id)!]).total }))
    .sort((a, b) => (Math.abs(a.total - b.total) > EPS ? b.total - a.total : a.id < b.id ? -1 : 1))
    .slice(0, limit)
    .map(({ id }) => {
      const c = ctx.byId.get(id)!;
      const after = evaluate(ctx, [...teamIds, id]);
      return {
        id,
        after,
        gain: after.total - current.total,
        partDeltas: diffParts(after.parts, current.parts),
        fillsRoles: ctx.targets.filter((_, i) => c.roleBits & (1 << i) && !(listed & (1 << i))).map((t) => ({ role: t.role, level: t.level })),
        addsSkills: ctx.needs.skills.filter((s) => c.p.skills.includes(s) && !have.has(s)),
      };
    });
  return { current, candidates };
}
