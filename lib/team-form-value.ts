import type { TeamRequirements } from "@/lib/validation/team";

/** Shared (server + client) shape of the team form. Not a client module. */
export type TeamFormValue = {
  name: string;
  description: string;
  open_positions: number;
  recruiting: boolean;
  must_roles: string[];
  preferred_roles: string[];
  skills: string[];
  topics: string[];
  goal: string | null;
  min_shared_hours: string;
  note: string;
};

export function teamFormValueFrom(t: {
  name: string;
  description: string | null;
  recruiting: boolean;
  open: number;
  requirements: TeamRequirements;
}): TeamFormValue {
  const r = t.requirements;
  return {
    name: t.name,
    description: t.description ?? "",
    open_positions: t.open,
    recruiting: t.recruiting,
    must_roles: r.must_roles ?? [],
    preferred_roles: r.preferred_roles ?? [],
    skills: r.skills ?? [],
    topics: r.topics ?? [],
    goal: r.goal ?? null,
    min_shared_hours: r.min_shared_hours === undefined ? "" : String(r.min_shared_hours),
    note: r.note ?? "",
  };
}
