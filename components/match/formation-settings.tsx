"use client";

import { useId, useState } from "react";
import { CalendarDays, Check, ChevronRight, GraduationCap, Scale, Target, UsersRound, type LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { inputClass } from "@/components/forms/field";
import { ROLES } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

export const TARGET_ROLES = ROLES.filter((r) => r.id !== "flexible");
export const MAX_ROLES = 5;

/** Friendlier names + icons for the engine's weighting presets (keys and weights unchanged). */
const PRESET_UI: Record<string, { label: string; icon: LucideIcon }> = {
  balanced: { label: "Balanced skills", icon: Scale },
  goals: { label: "Similar goals", icon: Target },
  interests: { label: "Shared interests", icon: UsersRound },
  schedule: { label: "Schedule compatibility", icon: CalendarDays },
  course: { label: "Course project fit", icon: GraduationCap },
};
const PRESET_ORDER = ["balanced", "goals", "interests", "schedule", "course"];

export type Prefs = { teamSize: number; preset: string; mustRoles: string[]; minHours: string; strict: boolean };

function Section({ title, aside, children, labelId }: { title: string; aside?: React.ReactNode; children: React.ReactNode; labelId: string }) {
  return (
    <div className="flex flex-col gap-3 border-b py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={labelId} className="text-base font-semibold">{title}</h2>
        {aside && <span className="text-sm text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

export function FormationSettings({
  prefs,
  onChange,
  sizes,
  presets,
  existingTeam,
}: {
  prefs: Prefs;
  onChange: (next: Prefs) => void;
  sizes: number[];
  presets: { key: string; label: string }[];
  /** Completing an existing team: size, roles and hours come from the team's own requirements. */
  existingTeam: boolean;
}) {
  const id = useId();
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => onChange({ ...prefs, [k]: v });
  const ordered = [...presets].sort((a, b) => {
    const ia = PRESET_ORDER.indexOf(a.key);
    const ib = PRESET_ORDER.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const atMax = prefs.mustRoles.length >= MAX_ROLES;
  const advancedSet = (!existingTeam && prefs.minHours !== "" ? 1 : 0) + (prefs.strict ? 1 : 0);
  // Collapsed by default; starts open only when a restored preference uses it.
  const [advancedOpen, setAdvancedOpen] = useState(advancedSet > 0);

  return (
    <div className="flex flex-col">
      {!existingTeam && (
        <Section title="Team size" labelId={`${id}-size`} aside="including you">
          <div role="radiogroup" aria-labelledby={`${id}-size`} className="flex flex-wrap gap-2">
            {sizes.map((n) => {
              const on = prefs.teamSize === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${n} people`}
                  onClick={() => set("teamSize", n)}
                  className={cn(
                    "h-11 min-w-16 rounded-lg border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    on ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" : "bg-background hover:bg-muted",
                  )}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {!existingTeam && (
        <Section title="Required roles" labelId={`${id}-roles`} aside={`Up to ${MAX_ROLES} · optional`}>
          <div role="group" aria-labelledby={`${id}-roles`} aria-describedby={`${id}-roles-hint`} className="flex flex-wrap gap-2">
            {TARGET_ROLES.map((r) => {
              const on = prefs.mustRoles.includes(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && atMax}
                  title={r.hint}
                  onClick={() => set("mustRoles", on ? prefs.mustRoles.filter((x) => x !== r.id) : [...prefs.mustRoles, r.id])}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40",
                    on ? "border-primary/30 bg-primary/10 font-medium text-primary" : "bg-background hover:bg-muted",
                  )}
                >
                  {on && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
                  {r.label}
                </button>
              );
            })}
          </div>
          <p id={`${id}-roles-hint`} className="text-xs text-muted-foreground">
            {prefs.mustRoles.length === 0
              ? "None selected: a typical role mix for your team size is used."
              : `${prefs.mustRoles.length} of ${MAX_ROLES} selected.`}
          </p>
        </Section>
      )}

      <Section title="What matters most?" labelId={`${id}-preset`}>
        <div role="radiogroup" aria-labelledby={`${id}-preset`} className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {ordered.map((p) => {
            const ui = PRESET_UI[p.key];
            const Icon = ui?.icon ?? Scale;
            const on = prefs.preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set("preset", p.key)}
                className={cn(
                  "flex min-h-[5.25rem] flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center text-sm leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  on ? "border-primary bg-primary/5 font-medium text-primary ring-1 ring-primary" : "bg-background hover:bg-muted",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {ui?.label ?? p.label}
              </button>
            );
          })}
        </div>
      </Section>

      <div className="pt-4">
        <details className="group rounded-xl border bg-background" open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)} data-testid="advanced-options">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
            Advanced options
            {advancedSet > 0 && <span className="text-xs font-normal text-muted-foreground">({advancedSet} set)</span>}
          </summary>
          <div className="grid gap-4 border-t px-4 py-4 sm:grid-cols-2">
            {!existingTeam && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-hours`} className="text-sm font-medium">
                  Minimum shared hours/week <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <input
                  id={`${id}-hours`}
                  type="number"
                  min={0}
                  max={40}
                  inputMode="numeric"
                  className={inputClass}
                  value={prefs.minHours}
                  onChange={(e) => set("minHours", e.target.value)}
                  placeholder="e.g. 6"
                />
              </div>
            )}
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <label htmlFor={`${id}-strict`} className="text-sm font-medium">Strict requirements</label>
                <p id={`${id}-strict-desc`} className="mt-0.5 text-xs text-muted-foreground">
                  Only propose teams that cover every required role{existingTeam ? "" : " and the minimum shared hours"}. May return no team.
                </p>
              </div>
              <Switch id={`${id}-strict`} checked={prefs.strict} onCheckedChange={(v) => set("strict", v)} aria-describedby={`${id}-strict-desc`} />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
