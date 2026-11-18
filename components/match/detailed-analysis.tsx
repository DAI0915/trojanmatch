"use client";

import { ChevronRight } from "lucide-react";
import type { FormResponse } from "@/lib/matching/service";
import type { TeamView } from "@/lib/matching/view";
import { cn } from "@/lib/utils";
import { DimensionBars, FitHeadline, Gaps, RoleCoverage, ScheduleSummary, SkillChips } from "./fit";

export type Change = { removed: string; added: string; delta: number; partDeltas: Record<string, number>; previous: number };

function Block({ id, title, children, className }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3", className)}>
      <h3 id={id} className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Everything the engine computed, behind one disclosure: scores and weights,
 * coverage, availability, interests and working style, gaps, alternatives, and
 * the whole-team vs. individual-ranking comparison.
 */
export function DetailedAnalysis({
  result,
  current,
  option,
  change,
  existingTeam,
  candidateCount,
  onPickOption,
  open,
  onOpenChange,
}: {
  result: FormResponse;
  current: TeamView;
  option: number;
  change: Change | null;
  existingTeam: boolean;
  candidateCount: number;
  onPickOption: (i: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <details
      className="group rounded-xl border bg-card"
      data-testid="detailed-analysis"
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-start gap-2 rounded-xl px-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-5 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
        <span>
          <span className="block font-semibold">See detailed analysis</span>
          <span className="block text-xs text-muted-foreground">
            Scores and weights, role coverage, schedule, alternatives, and whole-team optimization vs. individual ranking
          </span>
        </span>
      </summary>

      <div className="flex flex-col gap-7 border-t px-4 py-5 sm:px-5">
        {result.baseline && result.comparison && (
          <Block id="baseline-heading" title="Whole-team optimization vs. simple individual ranking">
            <div data-testid="baseline" className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                A simple recommender picks the {candidateCount} people who each look best next to {existingTeam ? "your current members" : "you"}. TrojanMatch scores every complete team
                together ({result.search.evaluations.toLocaleString()} possible teams compared) and keeps the best one.
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[320px] text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="px-3 py-2 font-medium">Method</th>
                      <th scope="col" className="px-3 py-2 font-medium">Team fit</th>
                      <th scope="col" className="px-3 py-2 font-medium">Role coverage</th>
                      <th scope="col" className="px-3 py-2 font-medium">Shared h/week</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <th scope="row" className="px-3 py-2 text-left font-medium text-primary">Whole-team optimization</th>
                      <td className="px-3 py-2 font-mono">{result.comparison.score.toFixed(3)}</td>
                      <td className="px-3 py-2 font-mono">{Math.round(result.comparison.roleCoverage * 100)}%</td>
                      <td className="px-3 py-2 font-mono">{result.comparison.sharedHours}</td>
                    </tr>
                    <tr className="border-t">
                      <th scope="row" className="px-3 py-2 text-left font-normal">Top individuals</th>
                      <td className="px-3 py-2 font-mono">{result.baseline.score.toFixed(3)}</td>
                      <td className="px-3 py-2 font-mono">{Math.round(result.baseline.roleCoverage * 100)}%</td>
                      <td className="px-3 py-2 font-mono">{result.baseline.sharedHours}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Top individuals would be: {result.baseline.team.members.map((m) => m.name).join(", ")}. The comparison is for the best recommendation, before any replacement.
              </p>
            </div>
          </Block>
        )}

        <Block id="score-heading" title="Overall match score">
          <FitHeadline team={current} previous={change?.previous} />
          {change && (
            <p className="text-sm text-muted-foreground">
              After replacing {change.removed} with {change.added}: team fit {change.previous.toFixed(3)} → {current.score.toFixed(3)}.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Calculated deterministically from profiles with {result.preset_label.toLowerCase()} weighting ({result.search.method}, {result.search.evaluations.toLocaleString()} possible teams compared).
            Scores are relative, not a prediction of success. Strong ≥ 0.75 · Good ≥ 0.60 · Fair ≥ 0.45.
          </p>
        </Block>

        <Block id="dims-heading" title="Score by dimension (weight)">
          <DimensionBars dimensions={current.dimensions} deltas={change?.partDeltas} />
        </Block>

        <div className="grid gap-7 md:grid-cols-2">
          <Block id="roles-heading" title="Role & skill coverage">
            <RoleCoverage roles={current.roles} usingDefault={current.usingDefaultRoles} />
            <SkillChips covered={current.skillsCovered} missing={current.skillsMissing} areas={current.skillAreas} />
          </Block>
          <div className="flex flex-col gap-7">
            <Block id="avail-heading" title="Shared availability">
              <ScheduleSummary schedule={current.schedule} />
            </Block>
            <Block id="gaps-heading" title="Weaknesses & gaps">
              <Gaps gaps={current.gaps} />
            </Block>
          </div>
        </div>

        {result.proposals.length > 1 && (
          <Block id="alts-heading" title="Alternative teams">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Team options">
              {result.proposals.map((p, i) => {
                const on = option === i && !change;
                return (
                  <button
                    key={p.key}
                    role="tab"
                    type="button"
                    aria-selected={on}
                    onClick={() => onPickOption(i)}
                    className={cn("rounded-full border px-3 py-1 text-sm", on ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted")}
                  >
                    {i === 0 ? "Best match" : `Alternative ${i}`} · {p.score.toFixed(2)}
                  </button>
                );
              })}
            </div>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {result.proposals.map((p, i) => (
                <li key={p.key}>
                  <span className="font-medium text-foreground">{i === 0 ? "Best match" : `Alternative ${i}`}:</span>{" "}
                  {p.members.filter((m) => m.kind === "candidate").map((m) => m.name).join(", ")} ({p.band})
                </li>
              ))}
            </ul>
          </Block>
        )}
      </div>
    </details>
  );
}
