"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ChipSelect } from "@/components/forms/chip-select";
import { Field, FieldGroup, inputClass } from "@/components/forms/field";
import { Segmented } from "@/components/forms/segmented";
import { TagInput } from "@/components/forms/tag-input";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { GOALS, INTERESTS, ROLES, SKILLS, type SpaceType } from "@/lib/taxonomy";
import { createTeamSchema, updateTeamSchema } from "@/lib/validation/team";
import type { TeamFormValue } from "@/lib/team-form-value";

export type { TeamFormValue };

const knownSkill = new Set(SKILLS.map((s) => s.id));



export function TeamForm({
  mode,
  slug,
  spaceId,
  teamId,
  spaceType,
  minTeamSize,
  maxTeamSize,
  currentMembers,
  initial,
}: {
  mode: "create" | "edit";
  slug: string;
  spaceId: string;
  teamId?: string;
  spaceType: SpaceType;
  minTeamSize: number;
  maxTeamSize: number;
  currentMembers: number;
  initial: TeamFormValue;
}) {
  const router = useRouter();
  const [v, setV] = useState<TeamFormValue>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof TeamFormValue>(k: K, val: TeamFormValue[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((e) => {
      if (!(k in e)) return e;
      const n = { ...e };
      delete n[k as string];
      return n;
    });
  };

  const minTarget = Math.max(minTeamSize, 2);
  const maxOpen = Math.max(maxTeamSize - currentMembers, 0);
  const minOpen = mode === "create" ? Math.max(minTarget - currentMembers, 1) : Math.max(minTarget - currentMembers, 0);
  const target = currentMembers + (Number.isFinite(v.open_positions) ? v.open_positions : 0);

  function payload() {
    return {
      name: v.name,
      description: v.description,
      open_positions: v.open_positions,
      recruiting: v.recruiting,
      requirements: {
        must_roles: v.must_roles,
        preferred_roles: v.preferred_roles,
        skills: v.skills,
        topics: v.topics,
        goal: v.goal,
        min_shared_hours: v.min_shared_hours === "" ? null : Number(v.min_shared_hours),
        note: v.note,
      },
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const schema = mode === "create" ? createTeamSchema(spaceType) : updateTeamSchema(spaceType);
    const body = payload();
    const parsed = schema.safeParse(body);
    const fe: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === "requirements" ? String(issue.path[1] ?? "requirements") : String(issue.path[0]);
        fe[key] ??= issue.message;
      }
    }
    if (target < minTarget || target > maxTeamSize) {
      fe.open_positions = `Team size (members + open positions) must be ${minTarget}–${maxTeamSize} for this Space.`;
    }
    if (v.recruiting && v.open_positions < 1) fe.open_positions = "Add at least one open position to recruit.";
    setErrors(fe);
    if (Object.keys(fe).length) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const res = await apiFetch<{ team: { team_id: string } }>(`/api/spaces/${spaceId}/teams`, { method: "POST", json: body });
        toast.success("Team created. You're its owner.");
        router.push(`/s/${slug}/teams/${res.team.team_id}`);
      } else {
        await apiFetch(`/api/teams/${teamId}`, { method: "PATCH", json: body });
        toast.success("Team updated.");
        router.push(`/s/${slug}/teams/${teamId}`);
      }
      router.refresh();
    } catch (err) {
      const e2 = err as ApiClientError;
      toast.error(e2.message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
        <h2 className="font-medium">Team basics</h2>
        <Field id="team-name" label="Team name" required error={errors.name}>
          <input id="team-name" className={inputClass} value={v.name} maxLength={60} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
        </Field>
        <Field id="team-description" label="What are you building?" error={errors.description}>
          <Textarea id="team-description" rows={3} maxLength={500} value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="One or two sentences about the idea or project." />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[12rem_1fr] sm:items-start">
          <Field
            id="open-positions"
            label="Open positions"
            required
            error={errors.open_positions}
            hint={`${currentMembers} member${currentMembers === 1 ? "" : "s"} now → team size ${target} (this Space allows ${minTarget}–${maxTeamSize}).`}
          >
            <input
              id="open-positions"
              type="number"
              inputMode="numeric"
              min={minOpen}
              max={maxOpen}
              className={inputClass}
              value={Number.isFinite(v.open_positions) ? v.open_positions : ""}
              onChange={(e) => set("open_positions", e.target.value === "" ? Number.NaN : Number(e.target.value))}
              aria-invalid={!!errors.open_positions}
            />
          </Field>
          <div className="flex items-start justify-between gap-4 rounded-lg border bg-background p-3">
            <div>
              <label htmlFor="recruiting" className="text-sm font-medium">Recruiting</label>
              <p id="recruiting-desc" className="mt-0.5 text-xs text-muted-foreground">
                Show this team to participants of this Space so they can see what you need.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <span className="text-xs text-muted-foreground" aria-hidden>{v.recruiting ? "On" : "Off"}</span>
              <Switch id="recruiting" checked={v.recruiting} onCheckedChange={(x) => set("recruiting", x)} aria-describedby="recruiting-desc" />
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6">
        <div>
          <h2 className="font-medium">Who you&apos;re looking for</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Required roles are must-haves; preferred roles are nice-to-haves. These drive skill-gap analysis and recommendations.
          </p>
        </div>
        <FieldGroup label="Required roles" error={errors.must_roles}>
          <ChipSelect
            options={ROLES}
            value={v.must_roles}
            onChange={(r) => {
              set("must_roles", r);
              set("preferred_roles", v.preferred_roles.filter((x) => !r.includes(x)));
            }}
            max={6}
          />
        </FieldGroup>
        <FieldGroup label="Preferred roles" error={errors.preferred_roles}>
          <ChipSelect options={ROLES.filter((r) => !v.must_roles.includes(r.id))} value={v.preferred_roles} onChange={(r) => set("preferred_roles", r)} max={6} />
        </FieldGroup>
        <FieldGroup label="Desired technical skills" error={errors.skills}>
          <ChipSelect
            options={SKILLS}
            value={v.skills.filter((s) => knownSkill.has(s))}
            onChange={(known) => set("skills", [...known, ...v.skills.filter((s) => !knownSkill.has(s))])}
            grouped
            size="sm"
            max={20}
          />
          <TagInput id="team-custom-skill" value={v.skills} onChange={(s) => set("skills", s)} isKnown={(t) => knownSkill.has(t)} max={20} placeholder="Add another skill (e.g. Unity)" />
        </FieldGroup>
        <FieldGroup label="Project topics" error={errors.topics}>
          <ChipSelect options={INTERESTS} value={v.topics} onChange={(t) => set("topics", t)} grouped size="sm" max={10} />
        </FieldGroup>
        <FieldGroup label="Team goal & commitment" error={errors.goal}>
          <Segmented name="team-goal" layout="cards" options={GOALS[spaceType]} value={v.goal} nullable onChange={(g) => set("goal", g)} ariaLabel="Team goal" />
        </FieldGroup>
        <Field id="min-shared-hours" label="Minimum shared availability (hours/week)" error={errors.min_shared_hours} hint="Hours per week the team should be free at the same time. Leave empty for no minimum.">
          <input
            id="min-shared-hours"
            type="number"
            inputMode="numeric"
            min={0}
            max={40}
            className={`${inputClass} sm:w-40`}
            value={v.min_shared_hours}
            onChange={(e) => set("min_shared_hours", e.target.value)}
            aria-invalid={!!errors.min_shared_hours}
          />
        </Field>
        <Field id="recruit-note" label="Recruitment notes" error={errors.note}>
          <Textarea id="recruit-note" rows={2} maxLength={500} value={v.note} onChange={(e) => set("note", e.target.value)} placeholder="e.g. We meet Tuesday evenings; backend is covered." />
        </Field>
      </section>

      {mode === "create" && (
        <p className="flex gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          You&apos;ll be the owner and only member. Nobody is added until they accept an invitation.
        </p>
      )}

      <div data-toast-avoid className="sticky bottom-0 -mx-4 flex items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Link href={teamId ? `/s/${slug}/teams/${teamId}` : `/s/${slug}/teams`} className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
          {mode === "create" ? "Create team" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
