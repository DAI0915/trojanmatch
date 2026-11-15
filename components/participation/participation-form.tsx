"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AvailabilityGrid } from "@/components/forms/availability-grid";
import { ChipSelect } from "@/components/forms/chip-select";
import { ConsentSwitch } from "@/components/forms/consent-switch";
import { Field, FieldGroup } from "@/components/forms/field";
import { Segmented } from "@/components/forms/segmented";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { GOALS, INTERESTS, ROLES, type SpaceType } from "@/lib/taxonomy";

export type ParticipationValue = {
  goal: string | null;
  goal_note: string;
  desired_roles: string[];
  topics: string[];
  availability_override: number[] | null;
  looking_for_team: boolean;
  accept_invites: boolean;
  smart_match_opt_in: boolean;
  visible_to_members: boolean;
  notes: string;
};

export function ParticipationForm({
  spaceId,
  slug,
  spaceType,
  initial,
  profileAvailability,
  profileTimezone,
  firstTime,
}: {
  spaceId: string;
  slug: string;
  spaceType: SpaceType;
  initial: ParticipationValue;
  profileAvailability: number[];
  profileTimezone: string;
  firstTime: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof ParticipationValue>(k: K, val: ParticipationValue[K]) => setV((p) => ({ ...p, [k]: val }));
  const override = v.availability_override !== null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/api/spaces/${spaceId}/participation`, { method: "PUT", json: v });
      toast.success("Preferences saved for this Space.");
      router.push(`/s/${slug}/discover`);
      router.refresh();
    } catch (err) {
      toast.error((err as ApiClientError).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6">
        <div>
          <h2 className="font-medium">Your goals in this Space</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            These apply only here. Other Spaces keep their own settings.
          </p>
        </div>
        <FieldGroup label="Goal / commitment" hint="Used to find people with similar goals. No goal ranks higher than another.">
          <Segmented
            name="goal"
            layout="cards"
            options={GOALS[spaceType]}
            value={v.goal}
            nullable
            onChange={(g) => set("goal", g)}
            ariaLabel="Goal"
          />
        </FieldGroup>
        <Field id="goal_note" label="Anything to add about your goal?">
          <Textarea id="goal_note" rows={2} maxLength={280} value={v.goal_note} onChange={(e) => set("goal_note", e.target.value)} placeholder="e.g. Want to try a hardware hack this time" />
        </Field>
        <FieldGroup label="Roles you want to take here">
          <ChipSelect options={ROLES} value={v.desired_roles} onChange={(r) => set("desired_roles", r)} max={4} />
        </FieldGroup>
        <FieldGroup label={spaceType === "course" ? "Topics / research interests" : "Project themes"}>
          <ChipSelect options={INTERESTS} value={v.topics} onChange={(t) => set("topics", t)} grouped size="sm" max={8} />
        </FieldGroup>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6">
        <div>
          <h2 className="font-medium">Availability for this Space</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {spaceType === "hackathon" ? "e.g. weekends before the event." : "e.g. evenings after class."} Uses your profile
            default unless you override it.
          </p>
        </div>
        <Segmented
          name="availability_mode"
          options={[
            { id: "default", label: `Use my profile default (${profileAvailability.length} h/week)` },
            { id: "override", label: "Set different hours here" },
          ]}
          value={override ? "override" : "default"}
          onChange={(m) => set("availability_override", m === "override" ? (v.availability_override ?? profileAvailability) : null)}
          ariaLabel="Availability source"
        />
        {override && (
          <AvailabilityGrid
            valueUtc={v.availability_override ?? []}
            onChange={(h) => set("availability_override", h)}
            timeZone={profileTimezone}
            label="Availability for this Space"
          />
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="consent-heading">
        <div>
          <h2 id="consent-heading" className="font-medium">Visibility &amp; consent</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Everything starts off. Turn on only what you want. You can change these anytime, separately for each Space.
          </p>
        </div>
        <ConsentSwitch
          id="looking_for_team"
          label="I'm looking for a team"
          description="Show that you want to join or form a team in this Space."
          checked={v.looking_for_team}
          onChange={(x) => set("looking_for_team", x)}
        />
        <ConsentSwitch
          id="visible_to_members"
          label="Show my profile to members of this Space"
          description="Members of this Space (only) can see your name, skills, roles, interests and goals. Never your email."
          checked={v.visible_to_members}
          onChange={(x) => set("visible_to_members", x)}
        />
        <ConsentSwitch
          id="accept_invites"
          label="Accept team invitations"
          description="Teams in this Space may send you invitations. You always decide to accept or decline."
          checked={v.accept_invites}
          onChange={(x) => set("accept_invites", x)}
        />
        <ConsentSwitch
          id="smart_match_opt_in"
          label="Include me in AI team suggestions"
          description="Smart Team Formation may suggest you to others in this Space. AI never sends invites on its own."
          checked={v.smart_match_opt_in}
          onChange={(x) => set("smart_match_opt_in", x)}
        />
        {v.smart_match_opt_in && (!v.visible_to_members || !v.accept_invites) && (
          <p role="status" className="rounded-md bg-brand-gold/10 px-3 py-2 text-xs">
            To actually appear in AI suggestions you also need profile visibility and invitations turned on.
          </p>
        )}
      </section>

      <Field id="notes" label="Notes for potential teammates">
        <Textarea id="notes" rows={2} maxLength={500} value={v.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
          {firstTime ? "Save & continue" : "Save preferences"}
        </Button>
      </div>
    </form>
  );
}
