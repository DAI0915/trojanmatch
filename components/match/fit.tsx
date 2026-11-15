import { AlertTriangle, CalendarClock, Check, CircleDashed, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DimensionView, RoleView, TeamView } from "@/lib/matching/view";
import { cn } from "@/lib/utils";

const BAND_STYLE: Record<TeamView["band"], string> = {
  Strong: "border-primary/40 bg-primary/10 text-primary",
  Good: "border-primary/30 bg-primary/5 text-primary",
  Fair: "border-brand-gold/70 bg-brand-gold/15 text-brand-gold-foreground",
  Weak: "border-border bg-muted text-muted-foreground",
};

export function FitHeadline({ team, previous }: { team: TeamView; previous?: number | null }) {
  const delta = previous === null || previous === undefined ? null : Math.round((team.score - previous) * 1000) / 1000;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={cn("rounded-full border px-3 py-1 text-sm font-semibold", BAND_STYLE[team.band])} data-testid="team-fit-band">
        Team Fit: {team.band}
      </span>
      <span className="text-sm text-muted-foreground">
        internal score <span data-testid="team-fit-score" className="font-mono font-medium text-foreground">{team.score.toFixed(3)}</span> / 1
      </span>
      {delta !== null && delta !== 0 && <DeltaChip value={delta} digits={3} testId="team-fit-delta" />}
    </div>
  );
}

export function DeltaChip({ value, digits = 2, testId, label }: { value: number; digits?: number; testId?: string; label?: string }) {
  const zero = Math.abs(value) < 0.5 * 10 ** -digits;
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 font-mono text-xs",
        zero ? "text-muted-foreground" : value > 0 ? "border-primary/40 bg-primary/10 text-primary" : "border-foreground/20 bg-muted text-foreground",
      )}
    >
      {label && <span className="font-sans">{label}</span>}
      {zero ? "±0" : `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`}
      <span className="sr-only">{zero ? "no change" : value > 0 ? "improvement" : "decrease"}</span>
    </span>
  );
}

export function DimensionBars({ dimensions, deltas }: { dimensions: DimensionView[]; deltas?: Record<string, number> | null }) {
  return (
    <ul className="flex flex-col gap-3" aria-label="Score by dimension">
      {dimensions.map((d) => (
        <li key={d.key} data-testid={`dimension-${d.key}`}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{d.label}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {deltas && Math.abs(deltas[d.key] ?? 0) >= 0.005 && <DeltaChip value={deltas[d.key]} />}
              <span>
                <span className="font-mono text-foreground">{d.score.toFixed(2)}</span> · weight {Math.round(d.weight * 100)}%
              </span>
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${d.label}: ${d.score.toFixed(2)} of 1`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(d.score * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{d.summary}</p>
        </li>
      ))}
    </ul>
  );
}

const ROLE_ICON = { covered: Check, partial: Minus, missing: CircleDashed } as const;
const ROLE_TEXT = { covered: "Covered", partial: "Partly covered", missing: "Missing" } as const;

export function RoleCoverage({ roles, usingDefault }: { roles: RoleView[]; usingDefault: boolean }) {
  return (
    <div>
      <ul className="flex flex-col gap-1.5" aria-label="Role coverage">
        {roles.map((r) => {
          const Icon = ROLE_ICON[r.status];
          return (
            <li key={r.role} className="flex items-center gap-2 text-sm" data-testid={`role-${r.status}`}>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  r.status === "covered" ? "border-primary bg-primary text-primary-foreground" : r.status === "partial" ? "border-primary/50 text-primary" : "border-dashed text-muted-foreground",
                )}
              >
                <Icon className="size-3" aria-hidden />
              </span>
              <span className={r.status === "missing" ? "text-muted-foreground" : ""}>{r.role}</span>
              {r.level === "must" && <Badge variant="outline" className="h-4 px-1 text-[10px]">Required</Badge>}
              {r.level === "preferred" && <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground">Preferred</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">
                {ROLE_TEXT[r.status]}
                {r.by ? ` · ${r.by}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {usingDefault && (
        <p className="mt-2 text-xs text-muted-foreground">No roles were specified, so a typical role mix for this team size is used.</p>
      )}
    </div>
  );
}

export function SkillChips({ covered, missing, areas }: { covered: string[]; missing: string[]; areas: string[] }) {
  if (covered.length + missing.length === 0) {
    return <p className="text-sm text-muted-foreground">Skill areas covered: {areas.length ? areas.join(", ") : "none yet"}.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Desired skills">
      {covered.map((s) => (
        <li key={s} className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
          <Check className="size-3" aria-hidden /> {s}
        </li>
      ))}
      {missing.map((s) => (
        <li key={s} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground">
          <CircleDashed className="size-3" aria-hidden /> {s} <span className="sr-only">(missing)</span>
        </li>
      ))}
    </ul>
  );
}

export function ScheduleSummary({ schedule }: { schedule: TeamView["schedule"] }) {
  const ok = schedule.sharedHours >= schedule.targetHours;
  return (
    <div className="flex items-start gap-2 text-sm">
      <CalendarClock className={cn("mt-0.5 size-4 shrink-0", ok ? "text-primary" : "text-muted-foreground")} aria-hidden />
      <div>
        <p>
          <span className="font-medium" data-testid="shared-hours">{schedule.sharedHours} h/week</span> when everyone is free
          <span className="text-muted-foreground"> (target {schedule.targetHours})</span>
        </p>
        {schedule.windows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Best windows: {schedule.windows.join(", ")} · {schedule.timeZone.replace(/_/g, " ")}
          </p>
        )}
      </div>
    </div>
  );
}

export function Gaps({ gaps }: { gaps: string[] }) {
  if (gaps.length === 0) return <p className="text-sm text-muted-foreground">No gaps detected against the current targets.</p>;
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Weaknesses and gaps">
      {gaps.map((g) => (
        <li key={g} className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-gold-foreground" aria-hidden /> {g}
        </li>
      ))}
    </ul>
  );
}
