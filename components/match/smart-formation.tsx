"use client";

import { useState } from "react";
import { ArrowRight, Info, Loader2, Repeat2, Sparkles, UserX, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ChipSelect } from "@/components/forms/chip-select";
import { FieldGroup, inputClass } from "@/components/forms/field";
import { Segmented } from "@/components/forms/segmented";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import type { FormResponse, ReplaceResponse } from "@/lib/matching/service";
import type { TeamView } from "@/lib/matching/view";
import { ROLES } from "@/lib/taxonomy";
import { DeltaChip, DimensionBars, FitHeadline, Gaps, RoleCoverage, ScheduleSummary, SkillChips } from "./fit";
import { MemberCard } from "./member-card";

const TARGET_ROLES = ROLES.filter((r) => r.id !== "flexible");

type Preset = { key: string; label: string };
type Change = { removed: string; added: string; delta: number; partDeltas: Record<string, number>; previous: number };

export function SmartFormation({
  spaceId,
  minSize,
  maxSize,
  presets,
  defaultPreset,
  team,
}: {
  spaceId: string;
  minSize: number;
  maxSize: number;
  presets: Preset[];
  defaultPreset: string;
  team: { id: string; name: string; members: number; targetSize: number } | null;
}) {
  const sizes = Array.from({ length: maxSize - Math.max(minSize, 2) + 1 }, (_, i) => Math.max(minSize, 2) + i);
  const [teamSize, setTeamSize] = useState(Math.min(4, maxSize));
  const [preset, setPreset] = useState(defaultPreset);
  const [mustRoles, setMustRoles] = useState<string[]>([]);
  const [minHours, setMinHours] = useState("");
  const [strict, setStrict] = useState(false);
  const [excluded, setExcluded] = useState<{ id: string; name: string }[]>([]);

  const [result, setResult] = useState<FormResponse | null>(null);
  const [option, setOption] = useState(0);
  const [current, setCurrent] = useState<TeamView | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [loading, setLoading] = useState(false);
  const [replace, setReplace] = useState<ReplaceResponse | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);

  const params = (exclude = excluded) => ({
    team_id: team?.id ?? null,
    team_size: teamSize,
    preset,
    must_roles: team ? [] : mustRoles,
    min_shared_hours: team || minHours === "" ? null : Number(minHours),
    strict,
    exclude_ids: exclude.map((e) => e.id),
  });

  async function generate(exclude = excluded) {
    setLoading(true);
    try {
      const res = await apiFetch<FormResponse>(`/api/spaces/${spaceId}/match/form-team`, { method: "POST", json: params(exclude) });
      setResult(res);
      setOption(0);
      setCurrent(res.proposals[0] ?? null);
      setChange(null);
    } catch (err) {
      toast.error((err as ApiClientError).message);
    } finally {
      setLoading(false);
    }
  }

  async function openReplace(memberId: string) {
    if (!current) return;
    setReplacingId(memberId);
    try {
      const res = await apiFetch<ReplaceResponse>(`/api/spaces/${spaceId}/match/replace`, {
        method: "POST",
        json: { ...params(), member_ids: current.members.filter((m) => m.kind === "candidate").map((m) => m.id), remove_id: memberId },
      });
      setReplace(res);
    } catch (err) {
      toast.error((err as ApiClientError).message);
    } finally {
      setReplacingId(null);
    }
  }

  function applyReplacement(o: ReplaceResponse["options"][number]) {
    if (!replace || !current) return;
    setChange({ removed: replace.removed.name, added: o.candidate.name, delta: o.delta, partDeltas: o.part_deltas, previous: current.score });
    setCurrent(o.team);
    setReplace(null);
  }

  function exclude(m: { id: string; name: string }) {
    const next = [...excluded.filter((e) => e.id !== m.id), m];
    setExcluded(next);
    void generate(next);
  }

  const candidates = current?.members.filter((m) => m.kind === "candidate") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="controls-heading">
        <h2 id="controls-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden /> {team ? `Complete “${team.name}”` : "Build my ideal team"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {team
            ? `Your ${team.members} accepted member${team.members === 1 ? "" : "s"} stay fixed. The team's own requirements are used to fill ${Math.max(team.targetSize - team.members, 0)} open position${team.targetSize - team.members === 1 ? "" : "s"}.`
            : "Proposes a complete team around you, optimized as a whole: roles and skills, goals, interests, shared hours and working style."}
        </p>

        <div className="mt-5 flex flex-col gap-5">
          {!team && (
            <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="team-size" className="text-sm font-medium">Team size</label>
                <select id="team-size" className={inputClass} value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))}>
                  {sizes.map((n) => (
                    <option key={n} value={n}>{n} people</option>
                  ))}
                </select>
              </div>
              <FieldGroup label="Roles this team must have" hint="Leave empty to use a typical role mix.">
                <ChipSelect options={TARGET_ROLES} value={mustRoles} onChange={setMustRoles} max={5} size="sm" />
              </FieldGroup>
            </div>
          )}
          <FieldGroup label="What matters most" required>
            <Segmented name="preset" options={presets.map((p) => ({ id: p.key, label: p.label }))} value={preset} onChange={(p) => setPreset(p ?? defaultPreset)} ariaLabel="Priority" />
          </FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            {!team && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="min-hours" className="text-sm font-medium">
                  Minimum shared hours/week <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input id="min-hours" type="number" min={0} max={40} inputMode="numeric" className={inputClass} value={minHours} onChange={(e) => setMinHours(e.target.value)} placeholder="e.g. 6" />
              </div>
            )}
            <div className="flex items-start justify-between gap-4 rounded-lg border bg-background p-3">
              <div>
                <label htmlFor="strict" className="text-sm font-medium">Strict requirements</label>
                <p id="strict-desc" className="mt-0.5 text-xs text-muted-foreground">
                  Only propose teams that cover every required role and the minimum shared hours. May return no team.
                </p>
              </div>
              <Switch id="strict" checked={strict} onCheckedChange={setStrict} aria-describedby="strict-desc" />
            </div>
          </div>
          {excluded.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">Not suggesting:</span>
              {excluded.map((e) => (
                <span key={e.id} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs">
                  {e.name}
                  <button
                    type="button"
                    aria-label={`Allow ${e.name} again`}
                    className="rounded-full p-0.5 hover:bg-muted"
                    onClick={() => {
                      const next = excluded.filter((x) => x.id !== e.id);
                      setExcluded(next);
                      if (result) void generate(next);
                    }}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div>
            <Button size="lg" onClick={() => generate()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Sparkles data-icon="inline-start" aria-hidden />}
              {result ? "Regenerate team" : "Generate recommended team"}
            </Button>
          </div>
        </div>
      </section>

      {result && result.message && (
        <section role="status" data-testid="match-message" className="rounded-xl border border-brand-gold/60 bg-brand-gold/10 p-4 sm:p-5">
          <h2 className="font-medium">{result.proposals.length === 0 ? "No matches yet" : "Heads up"}</h2>
          <p className="mt-1 text-sm">{result.message}</p>
          {result.suggestions.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
              {result.suggestions.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {result && current && (
        <section aria-labelledby="proposal-heading" className="flex flex-col gap-5" data-testid="proposal">
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="proposal-heading" className="text-lg font-semibold">Recommended team</h2>
              <Badge variant="outline" className="border-dashed font-normal" data-testid="draft-status">
                Draft proposal · nobody has been invited
              </Badge>
            </div>
            <FitHeadline team={current} previous={change?.previous} />
            {change && (
              <p role="status" data-testid="replace-summary" className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                Replaced <strong>{change.removed}</strong> with <strong>{change.added}</strong>: team fit {change.previous.toFixed(3)} → {current.score.toFixed(3)}
                <DeltaChip value={change.delta} digits={3} />
              </p>
            )}
            {result.proposals.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Team options">
                {result.proposals.map((p, i) => (
                  <button
                    key={p.key}
                    role="tab"
                    type="button"
                    aria-selected={option === i && !change}
                    onClick={() => {
                      setOption(i);
                      setCurrent(p);
                      setChange(null);
                    }}
                    className={`rounded-full border px-3 py-1 text-sm ${option === i && !change ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
                  >
                    {i === 0 ? "Best match" : `Alternative ${i}`} · {p.score.toFixed(2)}
                  </button>
                ))}
              </div>
            )}
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Scores are calculated from profiles ({result.search.evaluations.toLocaleString()} possible teams compared, {result.preset_label.toLowerCase()} weighting). They are relative, not a prediction of success. Everyone except you
              {team ? " and your accepted members" : ""} is only a candidate until they accept an invitation.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {current.members.map((m) => (
              <li key={m.id}>
                <MemberCard
                  member={m}
                  highlight={!!change && m.name === change.added}
                  actions={
                    m.kind === "candidate" ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openReplace(m.id)} disabled={replacingId !== null} aria-label={`Replace ${m.name}`}>
                          {replacingId === m.id ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Repeat2 data-icon="inline-start" aria-hidden />}
                          Replace
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => exclude({ id: m.id, name: m.name })} disabled={loading} aria-label={`Don't suggest ${m.name}`}>
                          <UserX data-icon="inline-start" aria-hidden /> Don&apos;t suggest
                        </Button>
                      </>
                    ) : undefined
                  }
                />
              </li>
            ))}
          </ul>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="why-heading">
              <h3 id="why-heading" className="mb-3 font-medium">Why this team?</h3>
              <DimensionBars dimensions={current.dimensions} deltas={change?.partDeltas} />
            </section>
            <div className="flex flex-col gap-5">
              <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="roles-heading">
                <h3 id="roles-heading" className="mb-3 font-medium">Role &amp; skill coverage</h3>
                <RoleCoverage roles={current.roles} usingDefault={current.usingDefaultRoles} />
                <div className="mt-4">
                  <SkillChips covered={current.skillsCovered} missing={current.skillsMissing} areas={current.skillAreas} />
                </div>
              </section>
              <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="avail-heading">
                <h3 id="avail-heading" className="mb-3 font-medium">Availability overlap</h3>
                <ScheduleSummary schedule={current.schedule} />
              </section>
              <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="gaps-heading">
                <h3 id="gaps-heading" className="mb-3 font-medium">Weaknesses &amp; gaps</h3>
                <Gaps gaps={current.gaps} />
              </section>
            </div>
          </div>

          {result.baseline && result.comparison && (
            <details className="rounded-xl border bg-card p-4 sm:p-5" data-testid="baseline">
              <summary className="cursor-pointer font-medium">Compare with simple individual ranking</summary>
              <p className="mt-2 text-sm text-muted-foreground">
                A simple recommender picks the {candidates.length} people who each look best next to {team ? "your current members" : "you"}. TrojanMatch scores every complete team instead.
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[320px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-1 pr-3 font-normal">Method</th>
                      <th scope="col" className="py-1 pr-3 font-normal">Team fit</th>
                      <th scope="col" className="py-1 pr-3 font-normal">Role coverage</th>
                      <th scope="col" className="py-1 font-normal">Shared h/week</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <th scope="row" className="py-1.5 pr-3 text-left font-medium">Whole-team optimization</th>
                      <td className="py-1.5 pr-3 font-mono">{result.comparison.score.toFixed(3)}</td>
                      <td className="py-1.5 pr-3 font-mono">{Math.round(result.comparison.roleCoverage * 100)}%</td>
                      <td className="py-1.5 font-mono">{result.comparison.sharedHours}</td>
                    </tr>
                    <tr className="border-t">
                      <th scope="row" className="py-1.5 pr-3 text-left font-normal">Top individuals</th>
                      <td className="py-1.5 pr-3 font-mono">{result.baseline.score.toFixed(3)}</td>
                      <td className="py-1.5 pr-3 font-mono">{Math.round(result.baseline.roleCoverage * 100)}%</td>
                      <td className="py-1.5 font-mono">{result.baseline.sharedHours}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Top individuals would be: {result.baseline.team.members.map((m) => m.name).join(", ")}.
              </p>
            </details>
          )}

          <p className="flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            <ArrowRight className="size-4 shrink-0" aria-hidden />
            Sending invitations to the candidates you choose arrives in the next update. Nothing has been sent and no team was created.
          </p>
        </section>
      )}

      <Sheet open={replace !== null} onOpenChange={(o) => !o && setReplace(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-md">
          {replace && (
            <>
              <SheetHeader className="p-0 pb-3">
                <SheetTitle>Replace {replace.removed.name}</SheetTitle>
                <SheetDescription>
                  Each option shows how the whole team changes. Current team fit: {replace.current.score.toFixed(3)}.
                </SheetDescription>
              </SheetHeader>
              {replace.options.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other eligible candidates in this Space.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {replace.options.map((o) => (
                    <li key={o.candidate.id} className="rounded-xl border p-3" data-testid="replace-option">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{o.candidate.name}</p>
                          <p className="text-sm text-primary">{o.candidate.role ?? o.candidate.roles[0] ?? "Role not set"}</p>
                        </div>
                        <DeltaChip value={o.delta} digits={3} testId="replace-delta" />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Team fit {replace.current.score.toFixed(3)} → {o.team.score.toFixed(3)} ({o.team.band})
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {o.team.dimensions.map((d) => (
                          <DeltaChip key={d.key} value={o.part_deltas[d.key]} label={`${d.label} `} />
                        ))}
                      </div>
                      {o.candidate.reasons.length > 0 && <p className="mt-2 text-xs">{o.candidate.reasons.join(" · ")}</p>}
                      <Button size="sm" className="mt-3" onClick={() => applyReplacement(o)} aria-label={`Use ${o.candidate.name} instead`}>
                        Use {o.candidate.name.split(" ")[0]} instead
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
