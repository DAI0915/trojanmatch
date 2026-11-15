import { goalLabel, interestLabel, roleLabel, skillLabel, type SpaceType } from "@/lib/taxonomy";
import type { TeamRequirements } from "@/lib/validation/team";

function Chips({ items, tone = "default" }: { items: string[]; tone?: "must" | "default" }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <li
          key={i}
          className={
            tone === "must"
              ? "rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              : "rounded-full border px-2.5 py-0.5 text-xs"
          }
        >
          {i}
        </li>
      ))}
    </ul>
  );
}

export function RequirementsView({ requirements: r, spaceType }: { requirements: TeamRequirements; spaceType: SpaceType }) {
  const rows: { label: string; node: React.ReactNode }[] = [];
  if (r.must_roles?.length) rows.push({ label: "Required roles", node: <Chips items={r.must_roles.map(roleLabel)} tone="must" /> });
  if (r.preferred_roles?.length) rows.push({ label: "Preferred roles", node: <Chips items={r.preferred_roles.map(roleLabel)} /> });
  if (r.skills?.length) rows.push({ label: "Desired skills", node: <Chips items={r.skills.map(skillLabel)} /> });
  if (r.topics?.length) rows.push({ label: "Project topics", node: <Chips items={r.topics.map(interestLabel)} /> });
  if (r.goal) rows.push({ label: "Team goal", node: <span className="text-sm">{goalLabel(spaceType, r.goal) ?? r.goal}</span> });
  if (r.min_shared_hours !== undefined) {
    rows.push({ label: "Shared availability", node: <span className="text-sm">At least {r.min_shared_hours} h/week together</span> });
  }
  if (r.note) rows.push({ label: "Notes", node: <p className="whitespace-pre-line text-sm [overflow-wrap:anywhere]">{r.note}</p> });

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No specific requirements yet.</p>;
  return (
    <dl className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0">{row.node}</dd>
        </div>
      ))}
    </dl>
  );
}
