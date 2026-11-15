"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChipSelect } from "@/components/forms/chip-select";
import { Segmented } from "@/components/forms/segmented";
import { TagInput } from "@/components/forms/tag-input";
import { AvailabilityGrid } from "@/components/forms/availability-grid";
import { Field, FieldGroup, inputClass } from "@/components/forms/field";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { EXPERIENCE, INTERESTS, ROLES, SKILLS, TIMEZONES, WORKING_STYLE, type WorkingStyleKey } from "@/lib/taxonomy";
import { profileCompleteness, profileSchema } from "@/lib/validation/profile";

export type ProfileFormValue = {
  display_name: string;
  university: string;
  bio: string;
  skills: string[];
  roles: string[];
  interests: string[];
  experience: string | null;
  working_style: Partial<Record<WorkingStyleKey, string>>;
  availability: number[];
  timezone: string;
};

const knownSkill = new Set(SKILLS.map((s) => s.id));

export function ProfileForm({ initial, onboarding }: { initial: ProfileFormValue; onboarding: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<ProfileFormValue>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof ProfileFormValue>(k: K, val: ProfileFormValue[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setDirty(true);
    // Editing a field clears its stale error; it is re-validated on save.
    setErrors((e) => {
      if (!(k in e)) return e;
      const next = { ...e };
      delete next[k as string];
      return next;
    });
  };
  const timeZones = TIMEZONES.includes(v.timezone as (typeof TIMEZONES)[number])
    ? TIMEZONES
    : [v.timezone, ...TIMEZONES];
  const { missing } = profileCompleteness({ ...v, experience: v.experience });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const parsed = profileSchema.safeParse(v);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) fe[String(issue.path[0])] ??= issue.message;
      setErrors(fe);
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const res = await apiFetch<{ profile: { onboarded: boolean } }>("/api/profile", { method: "PUT", json: v });
      setDirty(false);
      toast.success(res.profile.onboarded ? "Profile saved." : "Saved. A few required fields are still empty.");
      router.refresh();
    } catch (err) {
      const e2 = err as ApiClientError;
      if (e2.details) {
        const fe: Record<string, string> = {};
        for (const [k, msgs] of Object.entries(e2.details)) if (msgs?.[0]) fe[k] = msgs[0];
        setErrors(fe);
      }
      toast.error(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-8">
      {missing.length > 0 && (
        <div role="status" className="rounded-lg border border-brand-gold/60 bg-brand-gold/10 px-4 py-3 text-sm">
          <span className="font-medium">{onboarding ? "Finish your profile to get matched. " : "Profile incomplete. "}</span>
          Still needed: {missing.join(", ")}.
        </div>
      )}

      <Section title="Basics" description="Your display name is shown only to students in Spaces where you choose to be visible.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="display_name" label="Display name" required error={errors.display_name}>
            <input
              id="display_name"
              className={inputClass}
              value={v.display_name}
              maxLength={60}
              onChange={(e) => set("display_name", e.target.value)}
              aria-invalid={!!errors.display_name}
              autoComplete="name"
            />
          </Field>
          <Field id="university" label="University" error={errors.university} hint="Self-reported. Not verified.">
            <input
              id="university"
              className={inputClass}
              value={v.university}
              maxLength={120}
              onChange={(e) => set("university", e.target.value)}
              placeholder="USC"
              autoComplete="organization"
            />
          </Field>
        </div>
        <Field id="bio" label="What I bring" error={errors.bio} hint="A short note for potential teammates.">
          <Textarea
            id="bio"
            value={v.bio}
            maxLength={1000}
            rows={3}
            onChange={(e) => set("bio", e.target.value)}
            placeholder="e.g. Backend-leaning CS junior; shipped two Next.js apps; want to try an LLM project."
          />
        </Field>
      </Section>

      <Section title="Skills & roles">
        <FieldGroup label="Technical skills" required error={errors.skills} hint="Pick what you can actually contribute. Add anything missing below.">
          <ChipSelect options={SKILLS} value={v.skills.filter((s) => knownSkill.has(s))} onChange={(known) => set("skills", [...known, ...v.skills.filter((s) => !knownSkill.has(s))])} grouped size="sm" />
          <TagInput id="custom-skill" value={v.skills} onChange={(s) => set("skills", s)} isKnown={(t) => knownSkill.has(t)} max={40} placeholder="Add another skill (e.g. Unity)" />
        </FieldGroup>
        <FieldGroup label="Preferred roles" required error={errors.roles}>
          <ChipSelect options={ROLES} value={v.roles} onChange={(r) => set("roles", r)} max={4} />
        </FieldGroup>
        <FieldGroup label="Experience" required error={errors.experience} hint="Self-reported; not a ranking.">
          <Segmented name="experience" layout="cards" options={EXPERIENCE} value={v.experience} onChange={(x) => set("experience", x)} ariaLabel="Experience" />
        </FieldGroup>
      </Section>

      <Section title="Interests">
        <FieldGroup label="Topics you care about" required error={errors.interests}>
          <ChipSelect options={INTERESTS} value={v.interests} onChange={(i) => set("interests", i)} grouped size="sm" max={10} />
        </FieldGroup>
      </Section>

      <Section title="Working style" description="Used to suggest compatible teammates. Leave any unset if you have no preference.">
        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(WORKING_STYLE) as WorkingStyleKey[]).map((k) => (
            <FieldGroup key={k} label={WORKING_STYLE[k].label}>
              <Segmented
                name={k}
                options={WORKING_STYLE[k].options}
                value={v.working_style[k] ?? null}
                nullable
                onChange={(x) => {
                  const ws = { ...v.working_style };
                  if (x) ws[k] = x;
                  else delete ws[k];
                  set("working_style", ws);
                }}
                ariaLabel={WORKING_STYLE[k].label}
              />
            </FieldGroup>
          ))}
        </div>
      </Section>

      <Section title="Default availability" description="Your usual week. You can override it per Space.">
        <Field id="timezone" label="Time zone" required error={errors.timezone}>
          <select id="timezone" className={inputClass} value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {timeZones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <FieldGroup label="When can you work on team projects?" required error={errors.availability}>
          <AvailabilityGrid valueUtc={v.availability} onChange={(h) => set("availability", h)} timeZone={v.timezone} />
        </FieldGroup>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
          Save profile
        </Button>
      </div>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
      <div>
        <h2 className="font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
