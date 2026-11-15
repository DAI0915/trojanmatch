/**
 * Structured choices for profiles and participation (spec §3).
 * IDs are stored in the database; labels are display-only.
 * Interests carry a parent group so matching can give partial credit for
 * related topics (P4) without embeddings.
 */

export type Option = { id: string; label: string };
export type GroupedOption = Option & { group: string };

export const SKILLS: GroupedOption[] = [
  { id: "python", label: "Python", group: "Languages" },
  { id: "javascript", label: "JavaScript", group: "Languages" },
  { id: "typescript", label: "TypeScript", group: "Languages" },
  { id: "java", label: "Java", group: "Languages" },
  { id: "cpp", label: "C / C++", group: "Languages" },
  { id: "go", label: "Go", group: "Languages" },
  { id: "rust", label: "Rust", group: "Languages" },
  { id: "swift", label: "Swift", group: "Languages" },
  { id: "kotlin", label: "Kotlin", group: "Languages" },
  { id: "sql", label: "SQL", group: "Languages" },
  { id: "react", label: "React", group: "Web & Mobile" },
  { id: "nextjs", label: "Next.js", group: "Web & Mobile" },
  { id: "node", label: "Node.js", group: "Web & Mobile" },
  { id: "html-css", label: "HTML / CSS", group: "Web & Mobile" },
  { id: "ios", label: "iOS", group: "Web & Mobile" },
  { id: "android", label: "Android", group: "Web & Mobile" },
  { id: "react-native", label: "React Native", group: "Web & Mobile" },
  { id: "ml", label: "Machine Learning", group: "AI & Data" },
  { id: "deep-learning", label: "Deep Learning", group: "AI & Data" },
  { id: "llm", label: "LLMs / Prompting", group: "AI & Data" },
  { id: "computer-vision", label: "Computer Vision", group: "AI & Data" },
  { id: "nlp", label: "NLP", group: "AI & Data" },
  { id: "pytorch", label: "PyTorch", group: "AI & Data" },
  { id: "data-analysis", label: "Data Analysis", group: "AI & Data" },
  { id: "statistics", label: "Statistics", group: "AI & Data" },
  { id: "databases", label: "Databases", group: "Infrastructure" },
  { id: "cloud", label: "Cloud (AWS/GCP)", group: "Infrastructure" },
  { id: "devops", label: "DevOps / Docker", group: "Infrastructure" },
  { id: "security", label: "Security", group: "Infrastructure" },
  { id: "embedded", label: "Embedded / Arduino", group: "Infrastructure" },
  { id: "ui-ux", label: "UI/UX Design", group: "Design & Product" },
  { id: "figma", label: "Figma", group: "Design & Product" },
  { id: "product", label: "Product Management", group: "Design & Product" },
  { id: "pitching", label: "Pitching / Demo", group: "Design & Product" },
  { id: "technical-writing", label: "Technical Writing", group: "Design & Product" },
  { id: "research", label: "Research", group: "Design & Product" },
];

export const ROLES: (Option & { hint: string })[] = [
  { id: "frontend", label: "Frontend", hint: "UI, web or mobile app" },
  { id: "backend", label: "Backend", hint: "APIs, data, infrastructure" },
  { id: "ai_ml", label: "AI / ML", hint: "Models, data pipelines, LLMs" },
  { id: "data", label: "Data & Analysis", hint: "Analysis, experiments, statistics" },
  { id: "design", label: "Design", hint: "UX, visuals, prototypes" },
  { id: "pm_pitch", label: "PM / Pitch", hint: "Scope, coordination, presenting" },
  { id: "research", label: "Research", hint: "Literature, methods, evaluation" },
  { id: "writing", label: "Writing", hint: "Reports, documentation" },
  { id: "flexible", label: "Flexible", hint: "Happy to fill gaps" },
];

export const INTERESTS: GroupedOption[] = [
  { id: "llm-agents", label: "LLM agents", group: "AI" },
  { id: "generative-ai", label: "Generative AI", group: "AI" },
  { id: "computer-vision", label: "Computer vision", group: "AI" },
  { id: "ai-safety", label: "AI safety", group: "AI" },
  { id: "education", label: "Education", group: "Impact" },
  { id: "health", label: "Health", group: "Impact" },
  { id: "climate", label: "Climate", group: "Impact" },
  { id: "accessibility", label: "Accessibility", group: "Impact" },
  { id: "social-good", label: "Social good", group: "Impact" },
  { id: "fintech", label: "Fintech", group: "Industry" },
  { id: "devtools", label: "Developer tools", group: "Industry" },
  { id: "productivity", label: "Productivity", group: "Industry" },
  { id: "gaming", label: "Gaming", group: "Industry" },
  { id: "media", label: "Media & entertainment", group: "Industry" },
  { id: "robotics", label: "Robotics", group: "Hardware" },
  { id: "iot", label: "IoT / Hardware", group: "Hardware" },
  { id: "security-privacy", label: "Security & privacy", group: "Systems" },
  { id: "data-viz", label: "Data visualization", group: "Systems" },
];

export const EXPERIENCE: (Option & { hint: string })[] = [
  { id: "beginner", label: "Beginner", hint: "First projects / first hackathon" },
  { id: "intermediate", label: "Intermediate", hint: "Shipped a few projects" },
  { id: "advanced", label: "Advanced", hint: "Led or shipped many projects" },
];

export const WORKING_STYLE = {
  sync: {
    label: "Collaboration",
    options: [
      { id: "sync", label: "Together live" },
      { id: "mixed", label: "Mix" },
      { id: "async", label: "Mostly async" },
    ],
  },
  planning: {
    label: "Approach",
    options: [
      { id: "plan_first", label: "Plan first" },
      { id: "mixed", label: "Balanced" },
      { id: "iterate_fast", label: "Iterate fast" },
    ],
  },
  comm: {
    label: "Check-ins",
    options: [
      { id: "daily", label: "Daily" },
      { id: "few_times_week", label: "Few times a week" },
      { id: "weekly", label: "Weekly" },
    ],
  },
} as const;
export type WorkingStyleKey = keyof typeof WORKING_STYLE;

/** Goals are per Space type and describe preference, never rank (spec §3.2). */
export const GOALS = {
  hackathon: [
    { id: "competitive", label: "Competitive", hint: "Aim to place / win prizes" },
    { id: "build", label: "Build something great", hint: "Ship a polished project" },
    { id: "learn", label: "Learn & have fun", hint: "Try new things, meet people" },
  ],
  course: [
    { id: "aim_a", label: "Aim for an A", hint: "High bar on every requirement" },
    { id: "learn_deeply", label: "Learn deeply", hint: "Understand the material well" },
    { id: "meet_requirements", label: "Meet requirements", hint: "Solid, efficient, on time" },
  ],
} as const;
export type SpaceType = keyof typeof GOALS;

export const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

const byId = <T extends Option>(list: readonly T[]) => new Map(list.map((o) => [o.id, o]));
const SKILL_MAP = byId(SKILLS);
const ROLE_MAP = byId(ROLES);
const INTEREST_MAP = byId(INTERESTS);

export const isKnownRole = (id: string) => ROLE_MAP.has(id);
export const isKnownInterest = (id: string) => INTEREST_MAP.has(id);

/** Custom (free-text) skills are allowed; they are stored lowercase as typed. */
export const CUSTOM_TAG = /^[a-z0-9][a-z0-9+#./ -]{0,29}$/;
export function normalizeCustomTag(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return CUSTOM_TAG.test(t) ? t : null;
}

export function skillLabel(id: string) {
  return SKILL_MAP.get(id)?.label ?? id;
}
export function roleLabel(id: string) {
  return ROLE_MAP.get(id)?.label ?? id;
}
export function interestLabel(id: string) {
  return INTEREST_MAP.get(id)?.label ?? id;
}
export function interestGroup(id: string) {
  return INTEREST_MAP.get(id)?.group ?? null;
}
export function goalLabel(type: SpaceType, id: string | null | undefined) {
  return GOALS[type].find((g) => g.id === id)?.label ?? null;
}
