/**
 * Synthetic demo fixture (spec §16.1). Every person here is FICTIONAL and is
 * labeled as synthetic in the UI. Loaded into a demo slot by
 * public.demo_reset_slot(); never into the production scope.
 *
 * Deliberately NOT included: TreeHacks 2027 — the presenter creates it live.
 */
import { localToUtcHours } from "@/lib/availability";
import type { Json } from "@/lib/database.types";

type Style = { sync?: "sync" | "mixed" | "async"; planning?: "plan_first" | "mixed" | "iterate_fast"; comm?: "daily" | "few_times_week" | "weekly" };
type HackGoal = "competitive" | "build" | "learn";
type CourseGoal = "aim_a" | "learn_deeply" | "meet_requirements";

// Local (Los Angeles) weekly patterns: [day 0=Sun..6=Sat, startHour, endHour)
const P = {
  weeknights: [[1, 18, 23], [2, 18, 23], [3, 18, 23], [4, 18, 23]],
  weekends: [[0, 10, 18], [6, 10, 18]],
  mornings: [[1, 8, 12], [3, 8, 12], [5, 8, 12], [6, 9, 12]],
  afternoons: [[1, 13, 17], [2, 13, 17], [4, 13, 17], [5, 13, 17]],
  latenight: [[0, 21, 24], [2, 21, 24], [4, 21, 24], [5, 21, 24], [6, 21, 24]],
  tuethu: [[2, 16, 21], [4, 16, 21]],
  saturday: [[6, 9, 21]],
  sunday: [[0, 12, 22]],
} as const;
type Pattern = keyof typeof P;

const REFERENCE = new Date("2026-11-14T20:00:00Z"); // PST reference for the demo weekend

function hours(patterns: Pattern[]): number[] {
  const local = new Set<number>();
  for (const p of patterns) for (const [d, s, e] of P[p]) for (let h = s; h < e; h++) local.add(d * 24 + h);
  return localToUtcHours(local, "America/Los_Angeles", REFERENCE);
}

type PersonaRow = [
  key: string,
  name: string,
  skills: string[],
  roles: string[],
  interests: string[],
  experience: "beginner" | "intermediate" | "advanced",
  style: Style,
  patterns: Pattern[],
  hackathonGoal: HackGoal,
  courseGoal: CourseGoal,
  bio: string,
];

const ROWS: PersonaRow[] = [
  // --- The four switchable personas -------------------------------------------------
  ["jordan", "Jordan Lee", ["typescript", "react", "nextjs", "node", "databases"], ["backend", "frontend"], ["education", "llm-agents", "productivity"], "intermediate", { sync: "mixed", planning: "iterate_fast", comm: "daily" }, ["weeknights", "weekends"], "build", "learn_deeply", "Full-stack builder. Ships fast, wants a designer and an ML teammate."],
  ["maya", "Maya Chen", ["figma", "ui-ux", "react", "html-css", "typescript"], ["design", "frontend"], ["education", "accessibility", "health"], "intermediate", { sync: "sync", planning: "plan_first", comm: "daily" }, ["weeknights", "saturday"], "build", "aim_a", "Product designer who also codes React. Loves accessible, polished UIs."],
  ["priya", "Priya Raman", ["python", "pytorch", "ml", "llm", "nlp"], ["ai_ml", "research"], ["llm-agents", "education", "ai-safety"], "advanced", { sync: "mixed", planning: "plan_first", comm: "few_times_week" }, ["weekends", "tuethu"], "competitive", "aim_a", "ML research assistant. Fine-tuned LLMs and built eval pipelines."],
  ["alex", "Alex Morgan", ["product", "pitching", "technical-writing", "figma"], ["pm_pitch", "design"], ["social-good", "education", "productivity"], "intermediate", { sync: "sync", planning: "plan_first", comm: "daily" }, ["afternoons", "weekends"], "competitive", "meet_requirements", "Keeps scope tight and tells the story. Has pitched at three hackathons."],
  // --- Other synthetic students --------------------------------------------------------
  ["ethan", "Ethan Park", ["go", "databases", "cloud", "devops"], ["backend"], ["devtools", "security-privacy"], "advanced", { sync: "async", planning: "plan_first", comm: "few_times_week" }, ["latenight", "weekends"], "competitive", "aim_a", "Infra nerd. Postgres, queues, and making demos not fall over."],
  ["sofia", "Sofia Martinez", ["python", "data-analysis", "statistics", "sql"], ["data", "research"], ["health", "climate", "data-viz"], "intermediate", { sync: "mixed", planning: "plan_first", comm: "few_times_week" }, ["mornings", "tuethu"], "learn", "aim_a", "Biostats minor. Turns messy data into clear charts."],
  ["kai", "Kai Nakamura", ["swift", "ios", "ui-ux"], ["frontend", "design"], ["health", "productivity"], "intermediate", { sync: "sync", planning: "iterate_fast", comm: "daily" }, ["weeknights", "sunday"], "build", "learn_deeply", "iOS dev. Built a habit tracker with 2k users."],
  ["noah", "Noah Williams", ["java", "android", "kotlin"], ["frontend", "backend"], ["gaming", "media"], "beginner", { sync: "sync", planning: "iterate_fast", comm: "daily" }, ["weekends"], "learn", "meet_requirements", "First hackathon! Comfortable with Android basics."],
  ["amara", "Amara Okafor", ["python", "computer-vision", "pytorch", "ml"], ["ai_ml"], ["health", "accessibility", "computer-vision"], "advanced", { sync: "mixed", planning: "mixed", comm: "few_times_week" }, ["weekends", "weeknights"], "competitive", "aim_a", "Medical imaging research. Wants to ship a CV demo end to end."],
  ["lucas", "Lucas Silva", ["react", "nextjs", "typescript", "html-css"], ["frontend"], ["fintech", "productivity"], "intermediate", { sync: "mixed", planning: "iterate_fast", comm: "few_times_week" }, ["latenight", "saturday"], "build", "meet_requirements", "Frontend engineer intern. Tailwind enjoyer."],
  ["hana", "Hana Kim", ["figma", "ui-ux", "product"], ["design", "pm_pitch"], ["education", "social-good", "media"], "beginner", { sync: "sync", planning: "plan_first", comm: "daily" }, ["afternoons", "weekends"], "learn", "aim_a", "Design student exploring product. Great at user interviews."],
  ["omar", "Omar Haddad", ["cpp", "embedded", "python"], ["backend", "research"], ["iot", "robotics", "climate"], "advanced", { sync: "sync", planning: "plan_first", comm: "daily" }, ["weekends", "tuethu"], "competitive", "learn_deeply", "Hardware hacker: sensors, microcontrollers, a little ROS."],
  ["grace", "Grace Liu", ["python", "llm", "node", "typescript"], ["ai_ml", "backend"], ["llm-agents", "devtools", "generative-ai"], "intermediate", { sync: "async", planning: "iterate_fast", comm: "few_times_week" }, ["weeknights", "latenight"], "build", "learn_deeply", "Builds agent tooling. Has opinions about eval harnesses."],
  ["diego", "Diego Ramirez", ["python", "data-analysis", "sql", "cloud"], ["data", "backend"], ["climate", "social-good"], "intermediate", { sync: "mixed", planning: "mixed", comm: "few_times_week" }, ["mornings", "weekends"], "build", "meet_requirements", "Data engineering on public climate datasets."],
  ["zoe", "Zoe Thompson", ["technical-writing", "research", "pitching"], ["writing", "pm_pitch"], ["education", "ai-safety", "social-good"], "intermediate", { sync: "async", planning: "plan_first", comm: "weekly" }, ["mornings", "afternoons"], "learn", "aim_a", "Writes clear docs and sharp pitch decks."],
  ["ryan", "Ryan O'Connor", ["javascript", "node", "react", "databases"], ["backend", "frontend"], ["gaming", "devtools"], "beginner", { sync: "sync", planning: "iterate_fast", comm: "daily" }, ["latenight", "weekends"], "learn", "meet_requirements", "Bootcamp grad turned CS minor. Eager to pair program."],
  ["leila", "Leila Ahmadi", ["python", "ml", "statistics", "data-analysis"], ["ai_ml", "data"], ["health", "fintech"], "advanced", { sync: "mixed", planning: "plan_first", comm: "few_times_week" }, ["tuethu", "sunday"], "competitive", "aim_a", "Kaggle grinder. Feature engineering and solid baselines."],
  ["ben", "Ben Carter", ["rust", "go", "security", "devops"], ["backend"], ["security-privacy", "devtools"], "advanced", { sync: "async", planning: "mixed", comm: "weekly" }, ["latenight"], "competitive", "learn_deeply", "Security CTF player. Writes careful backend code."],
  ["isabella", "Isabella Rossi", ["ui-ux", "figma", "html-css"], ["design"], ["media", "gaming", "accessibility"], "intermediate", { sync: "sync", planning: "mixed", comm: "daily" }, ["afternoons", "saturday"], "build", "aim_a", "Visual designer. Motion and micro-interactions."],
  ["arjun", "Arjun Mehta", ["python", "llm", "nlp", "pytorch"], ["ai_ml", "research"], ["llm-agents", "education", "generative-ai"], "intermediate", { sync: "mixed", planning: "iterate_fast", comm: "few_times_week" }, ["weeknights", "weekends"], "competitive", "aim_a", "NLP coursework + side projects with RAG."],
  ["chloe", "Chloe Dubois", ["product", "pitching", "data-analysis"], ["pm_pitch", "data"], ["fintech", "social-good"], "intermediate", { sync: "sync", planning: "plan_first", comm: "daily" }, ["afternoons", "tuethu"], "competitive", "meet_requirements", "Econ + CS. Frames problems and pitches with numbers."],
  ["marcus", "Marcus Johnson", ["typescript", "react", "react-native", "node"], ["frontend", "flexible"], ["health", "social-good"], "intermediate", { sync: "mixed", planning: "iterate_fast", comm: "daily" }, ["weeknights", "saturday"], "build", "learn_deeply", "Mobile-first React Native dev. Happy to fill gaps."],
  ["yuki", "Yuki Tanaka", ["python", "computer-vision", "embedded"], ["ai_ml", "research"], ["robotics", "iot"], "advanced", { sync: "sync", planning: "plan_first", comm: "few_times_week" }, ["weekends"], "competitive", "aim_a", "Robotics lab. Perception on tiny hardware."],
  ["fatima", "Fatima Yusuf", ["sql", "databases", "python", "cloud"], ["backend", "data"], ["health", "education"], "intermediate", { sync: "async", planning: "plan_first", comm: "few_times_week" }, ["mornings", "sunday"], "build", "aim_a", "Backend + data modeling. Schema-first person."],
  ["sam", "Sam Rivera", ["javascript", "html-css", "figma"], ["frontend", "design", "flexible"], ["media", "gaming", "productivity"], "beginner", { sync: "sync", planning: "iterate_fast", comm: "daily" }, ["latenight", "saturday"], "learn", "meet_requirements", "Learning by building. Strong eye for layout."],
  ["nina", "Nina Petrova", ["statistics", "research", "technical-writing", "python"], ["research", "writing"], ["ai-safety", "education"], "advanced", { sync: "async", planning: "plan_first", comm: "weekly" }, ["mornings", "tuethu"], "learn", "aim_a", "Stats PhD student. Experiment design and write-ups."],
  ["jamal", "Jamal Brooks", ["node", "typescript", "cloud", "databases"], ["backend", "flexible"], ["fintech", "devtools"], "intermediate", { sync: "mixed", planning: "mixed", comm: "few_times_week" }, ["weeknights", "sunday"], "build", "meet_requirements", "APIs and integrations. Stripe, webhooks, auth."],
  ["elena", "Elena Garcia", ["ui-ux", "product", "research"], ["design", "research"], ["health", "accessibility", "social-good"], "intermediate", { sync: "sync", planning: "plan_first", comm: "daily" }, ["afternoons", "weekends"], "build", "learn_deeply", "UX researcher. Usability tests in 30 minutes flat."],
  ["tom", "Tom Becker", ["java", "sql", "databases"], ["backend"], ["fintech", "productivity"], "beginner", { sync: "mixed", planning: "plan_first", comm: "few_times_week" }, ["mornings"], "learn", "meet_requirements", "Spring Boot from internship; new to hackathons."],
  ["aisha", "Aisha Bello", ["python", "ml", "data-analysis", "statistics"], ["ai_ml", "data"], ["climate", "health", "data-viz"], "intermediate", { sync: "mixed", planning: "mixed", comm: "few_times_week" }, ["weekends", "tuethu"], "build", "aim_a", "Climate ML. Satellite data and forecasting."],
  ["victor", "Victor Huang", ["cpp", "rust", "devops"], ["backend", "flexible"], ["gaming", "devtools"], "advanced", { sync: "async", planning: "iterate_fast", comm: "weekly" }, ["latenight", "weekends"], "competitive", "learn_deeply", "Systems programmer. Game engines for fun."],
  ["olivia", "Olivia Brown", ["pitching", "product", "technical-writing"], ["pm_pitch", "writing"], ["education", "social-good"], "beginner", { sync: "sync", planning: "plan_first", comm: "daily" }, ["afternoons", "saturday"], "learn", "aim_a", "Business major who loves storytelling and demos."],
  ["daniel", "Daniel Cohen", ["python", "llm", "react", "node"], ["ai_ml", "frontend", "flexible"], ["llm-agents", "productivity"], "intermediate", { sync: "mixed", planning: "iterate_fast", comm: "daily" }, ["weeknights", "latenight"], "build", "learn_deeply", "Generalist: prompts, glue code and a decent UI."],
  ["mei", "Mei Wong", ["figma", "ui-ux", "react"], ["design", "frontend"], ["education", "media"], "advanced", { sync: "sync", planning: "plan_first", comm: "daily" }, ["weekends", "weeknights"], "competitive", "aim_a", "Design lead at a student startup."],
  ["tariq", "Tariq Nasser", ["python", "data-analysis", "sql"], ["data", "flexible"], ["fintech", "data-viz"], "beginner", { sync: "mixed", planning: "mixed", comm: "few_times_week" }, ["tuethu", "saturday"], "learn", "meet_requirements", "Analytics club member. Dashboards and SQL."],
  ["julia", "Julia Novak", ["research", "statistics", "python"], ["research", "data"], ["ai-safety", "health"], "intermediate", { sync: "async", planning: "plan_first", comm: "weekly" }, ["mornings", "sunday"], "learn", "learn_deeply", "Reads papers for fun; good at evaluation plans."],
  ["kevin", "Kevin Tran", ["javascript", "react", "node", "html-css"], ["frontend", "backend"], ["gaming", "media"], "intermediate", { sync: "sync", planning: "iterate_fast", comm: "daily" }, ["latenight", "weekends"], "competitive", "meet_requirements", "Hackathon regular. Fast prototyper."],
  ["rosa", "Rosa Delgado", ["product", "ui-ux", "pitching"], ["pm_pitch", "design"], ["social-good", "health"], "advanced", { sync: "sync", planning: "plan_first", comm: "daily" }, ["afternoons", "weeknights"], "competitive", "aim_a", "Shipped two civic-tech projects; strong facilitator."],
  ["will", "Will Anderson", ["python", "cloud", "devops", "databases"], ["backend", "flexible"], ["climate", "devtools"], "intermediate", { sync: "async", planning: "mixed", comm: "few_times_week" }, ["weeknights"], "build", "meet_requirements", "Deploys things. Docker, CI, cloud budgets."],
  ["sana", "Sana Qureshi", ["llm", "python", "technical-writing"], ["ai_ml", "writing"], ["education", "llm-agents", "accessibility"], "intermediate", { sync: "mixed", planning: "plan_first", comm: "few_times_week" }, ["tuethu", "weekends"], "build", "aim_a", "Builds tutoring assistants; writes clear evaluations."],
  ["leo", "Leo Fischer", ["swift", "ios", "figma"], ["frontend", "design"], ["productivity", "health"], "beginner", { sync: "sync", planning: "iterate_fast", comm: "daily" }, ["saturday", "sunday"], "learn", "meet_requirements", "Learning SwiftUI. Enthusiastic tester."],
  ["ivy", "Ivy Zhang", ["python", "ml", "pytorch", "statistics"], ["ai_ml", "research"], ["computer-vision", "generative-ai"], "advanced", { sync: "mixed", planning: "plan_first", comm: "few_times_week" }, ["weeknights", "sunday"], "competitive", "aim_a", "Diffusion models side project; strong math."],
  ["max", "Max Hoffmann", ["typescript", "node", "security"], ["backend"], ["security-privacy", "fintech"], "intermediate", { sync: "async", planning: "plan_first", comm: "weekly" }, ["latenight", "mornings"], "build", "learn_deeply", "Auth, payments and threat models."],
  ["nora", "Nora Ali", ["data-analysis", "pitching", "product"], ["data", "pm_pitch"], ["education", "social-good"], "intermediate", { sync: "sync", planning: "mixed", comm: "daily" }, ["afternoons", "weekends"], "learn", "aim_a", "Turns user research into crisp product bets."],
];

// Simulation priority: when the presenter simulates joins into a new Space,
// Maya, Priya and Alex arrive first so the invitation demo has known people.
const SIM_FIRST = ["maya", "priya", "alex", "grace", "amara", "lucas", "ethan", "mei", "arjun", "rosa", "kai", "diego"];

export type FixturePersona = {
  key: string;
  display_name: string;
  university: string;
  bio: string;
  skills: string[];
  roles: string[];
  interests: string[];
  experience: string;
  working_style: Style;
  availability: number[];
  timezone: string;
  hackathon_goal: HackGoal;
  course_goal: CourseGoal;
  sim_rank: number;
};

export const DEMO_PERSONAS: FixturePersona[] = ROWS.map((r) => {
  const rank = SIM_FIRST.indexOf(r[0]);
  return {
    key: r[0],
    display_name: r[1],
    university: "USC",
    bio: `${r[10]} (Synthetic demo persona.)`,
    skills: r[2],
    roles: r[3],
    interests: r[4],
    experience: r[5],
    working_style: r[6],
    availability: hours(r[7]),
    timezone: "America/Los_Angeles",
    hackathon_goal: r[8],
    course_goal: r[9],
    sim_rank: rank === -1 ? 100 : rank + 1,
  };
});

const byKey = new Map(DEMO_PERSONAS.map((p) => [p.key, p]));

export const DEMO_SPACES = [
  {
    key: "ai_usc_2026",
    type: "hackathon",
    title: "AI@USC Hackathon 2026",
    visibility: "public",
    creator: "ethan",
    min_team_size: 2,
    max_team_size: 4,
    team_size_source: "app_default",
    hackathon: {
      edition_year: 2026,
      organizer: "AI@USC (student org)",
      official_url: null,
      start_date: "2026-11-14",
      end_date: "2026-11-15",
      timezone: "America/Los_Angeles",
      format: "in_person",
      location: "USC, Los Angeles",
      rules_url: null,
    },
    course: null,
  },
  {
    key: "treehacks_2026",
    type: "hackathon",
    title: "TreeHacks 2026",
    visibility: "public",
    creator: "kai",
    min_team_size: 2,
    max_team_size: 4,
    team_size_source: "app_default",
    hackathon: {
      edition_year: 2026,
      organizer: "Stanford University",
      official_url: "https://www.treehacks.com",
      start_date: "2026-02-13",
      end_date: "2026-02-15",
      timezone: "America/Los_Angeles",
      format: "in_person",
      location: "Stanford, CA",
      rules_url: null,
    },
    course: null,
  },
  {
    key: "csci567_fall2026",
    type: "course",
    title: null,
    visibility: "unlisted",
    creator: "sofia",
    min_team_size: 3,
    max_team_size: 4,
    team_size_source: "creator_stated",
    hackathon: null,
    course: {
      university: "USC",
      term: "Fall 2026",
      course_code: "CSCI 567",
      course_title: "Machine Learning",
      allowed_sections: ["Section 1"],
      assignment_name: "Final Group Project",
      assignment_key: "FP",
      instructions_url: null,
    },
  },
] as const;

type Consent = { looking_for_team: boolean; accept_invites: boolean; smart_match_opt_in: boolean; visible_to_members: boolean };
const ALL_ON: Consent = { looking_for_team: true, accept_invites: true, smart_match_opt_in: true, visible_to_members: true };

// Some personas keep consent OFF so the demo can show that opted-out people are
// never suggested.
const OPT_OUT: Record<string, Partial<Consent>> = {
  tom: { smart_match_opt_in: false },
  nina: { visible_to_members: false, smart_match_opt_in: false },
  victor: { accept_invites: false, smart_match_opt_in: false },
  olivia: { looking_for_team: false },
};

const AI_USC = [
  "jordan", "maya", "priya", "alex", "ethan", "sofia", "kai", "noah", "amara", "lucas", "hana", "omar", "grace",
  "diego", "zoe", "ryan", "leila", "ben", "isabella", "arjun", "chloe", "marcus", "fatima", "sam", "jamal",
  "elena", "tom", "aisha", "victor", "olivia", "daniel", "nina",
];
const TREEHACKS_2026 = ["kai", "yuki", "julia", "kevin", "rosa", "will"];
// Overlaps with AI@USC (jordan, maya, priya, sofia, leila, aisha) carry DIFFERENT goals here.
const CSCI567 = [
  "sofia", "jordan", "maya", "priya", "leila", "aisha", "ivy", "max", "nora", "sana", "leo", "mei", "tariq",
  "julia", "rosa", "will",
];

// Synthetic recruiting teams (P4-A). None include the four switchable personas,
// so the live TreeHacks 2027 flow is unaffected. Every team satisfies the DB
// constraints: members are participants, target within the Space bounds,
// capacity respected, active teams meet the Space minimum.
export const DEMO_TEAMS = [
  {
    space: "ai_usc_2026",
    name: "Prompt Pilots",
    description: "An LLM study buddy that turns lecture slides into practice questions. (Synthetic demo team.)",
    owner: "ethan",
    members: ["grace"],
    status: "active",
    recruiting: true,
    target_size: 4,
    requirements: {
      must_roles: ["frontend"],
      preferred_roles: ["design"],
      skills: ["react", "figma"],
      topics: ["llm-agents", "education"],
      goal: "build",
      min_shared_hours: 6,
      note: "Backend + agents are covered; we need someone to own the UI.",
    },
  },
  {
    space: "ai_usc_2026",
    name: "GreenGrid",
    description: "Forecasting campus energy use from open climate data. (Synthetic demo team.)",
    owner: "diego",
    members: ["aisha"],
    status: "active",
    recruiting: true,
    target_size: 3,
    requirements: {
      must_roles: ["frontend"],
      preferred_roles: ["pm_pitch"],
      skills: ["react", "typescript"],
      topics: ["climate", "data-viz"],
      goal: "build",
      min_shared_hours: 4,
      note: "Looking for a frontend dev who enjoys charts.",
    },
  },
  {
    space: "ai_usc_2026",
    name: "CareCompanion",
    description: "Medication reminders with computer vision pill checks. (Synthetic demo team.)",
    owner: "amara",
    members: [],
    status: "draft",
    recruiting: true,
    target_size: 3,
    requirements: {
      must_roles: ["backend", "frontend"],
      skills: ["python", "react"],
      topics: ["health", "accessibility"],
      goal: "competitive",
      min_shared_hours: 8,
    },
  },
  {
    space: "csci567_fall2026",
    name: "Gradient Descenders",
    description: "Final project on fair risk prediction. (Synthetic demo team.)",
    owner: "sofia",
    members: [],
    status: "draft",
    recruiting: true,
    target_size: 4,
    requirements: {
      must_roles: ["ai_ml"],
      preferred_roles: ["writing"],
      skills: ["python", "pytorch"],
      topics: ["health"],
      goal: "aim_a",
      min_shared_hours: 6,
      note: "Weekly sync on Tuesdays.",
    },
  },
] as const;

const ON_A_TEAM = new Set<string>(DEMO_TEAMS.flatMap((t) => [`${t.space}:${t.owner}`, ...t.members.map((m) => `${t.space}:${m}`)]));

function part(space: string, key: string, type: "hackathon" | "course") {
  const p = byKey.get(key);
  if (!p) throw new Error(`unknown persona ${key}`);
  return {
    space,
    persona: key,
    goal: type === "hackathon" ? p.hackathon_goal : p.course_goal,
    desired_roles: p.roles.slice(0, 2),
    topics: p.interests.slice(0, 3),
    ...ALL_ON,
    ...(OPT_OUT[key] ?? {}),
    // Already on a team in this Space → not looking for one.
    ...(ON_A_TEAM.has(`${space}:${key}`) ? { looking_for_team: false } : {}),
    notes: null,
  };
}

export const DEMO_PARTICIPATIONS = [
  ...AI_USC.map((k) => part("ai_usc_2026", k, "hackathon")),
  ...TREEHACKS_2026.map((k) => part("treehacks_2026", k, "hackathon")),
  ...CSCI567.map((k) => part("csci567_fall2026", k, "course")),
];

/** Payload for public.demo_reset_slot() (plain JSON, exactly as sent over the wire). */
export function demoFixture(): Json {
  return JSON.parse(
    JSON.stringify({ personas: DEMO_PERSONAS, spaces: DEMO_SPACES, participations: DEMO_PARTICIPATIONS, teams: DEMO_TEAMS }),
  ) as Json;
}

export const DEMO_SPACE_COUNTS = {
  ai_usc_2026: AI_USC.length,
  treehacks_2026: TREEHACKS_2026.length,
  csci567_fall2026: CSCI567.length,
} as const;
