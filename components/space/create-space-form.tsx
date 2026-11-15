"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, GraduationCap, Info, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldGroup, inputClass } from "@/components/forms/field";
import { Segmented } from "@/components/forms/segmented";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { TIMEZONES } from "@/lib/taxonomy";
import { createSpaceSchema, parseSections } from "@/lib/validation/space";
import { cn } from "@/lib/utils";
import { JoinSpaceForm } from "./join-with-code";

type SpaceType = "hackathon" | "course";

type Match = {
  space_id: string;
  slug: string | null;
  title: string;
  type: SpaceType;
  visibility: "public" | "unlisted";
  match_kind: "exact" | "url" | "similar";
  requires_code: boolean;
  is_member: boolean;
  participant_count: number;
};

const now = new Date();
const YEARS = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2];

function defaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

export function CreateSpaceForm({ initialType, initialQuery }: { initialType: SpaceType; initialQuery: string }) {
  const router = useRouter();
  const [type, setType] = useState<SpaceType>(initialType);
  const tz0 = useMemo(defaultTimeZone, []);

  const [h, setH] = useState({
    title: initialType === "hackathon" ? initialQuery.replace(/\b(19|20)\d{2}\b/, "").trim() : "",
    edition_year: String(/\b((?:19|20)\d{2})\b/.exec(initialQuery)?.[1] ?? now.getFullYear() + 1),
    organizer: "",
    official_url: "",
    start_date: "",
    end_date: "",
    timezone: tz0,
    format: "in_person",
    location: "",
    rules_url: "",
    min_team_size: "",
    max_team_size: "",
    size_confirmed: false,
    team_deadline_local: "",
    visibility: "public",
  });
  const [c, setC] = useState({
    university: "USC",
    season: now.getMonth() >= 7 ? "Fall" : now.getMonth() >= 4 ? "Summer" : "Spring",
    year: String(now.getFullYear()),
    course_code: initialType === "course" ? initialQuery : "",
    course_title: "",
    sections: "",
    assignment_name: "",
    assignment_key: "",
    min_team_size: "",
    max_team_size: "",
    size_confirmed: false,
    timezone: tz0,
    team_deadline_local: "",
    instructions_url: "",
    visibility: "unlisted",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"form" | "review">("form");
  const [matches, setMatches] = useState<Match[]>([]);
  const [pending, setPending] = useState(false);

  const timeZones = (tz: string) => (TIMEZONES.includes(tz as (typeof TIMEZONES)[number]) ? TIMEZONES : [tz, ...TIMEZONES]);

  function buildPayload() {
    if (type === "hackathon") {
      const sized = h.size_confirmed && h.min_team_size && h.max_team_size;
      return {
        type,
        title: h.title,
        edition_year: h.edition_year,
        organizer: h.organizer,
        official_url: h.official_url,
        start_date: h.start_date,
        end_date: h.end_date,
        timezone: h.timezone,
        format: h.format,
        location: h.format === "online" ? "" : h.location,
        rules_url: h.rules_url,
        min_team_size: sized ? h.min_team_size : "",
        max_team_size: sized ? h.max_team_size : "",
        team_deadline_local: h.team_deadline_local,
        visibility: h.visibility,
      };
    }
    return {
      type,
      university: c.university,
      term: `${c.season} ${c.year}`,
      course_code: c.course_code,
      course_title: c.course_title,
      allowed_sections: parseSections(c.sections),
      assignment_name: c.assignment_name,
      assignment_key: c.assignment_key,
      min_team_size: c.min_team_size,
      max_team_size: c.max_team_size,
      timezone: c.timezone,
      team_deadline_local: c.team_deadline_local,
      instructions_url: c.instructions_url,
      visibility: c.visibility,
    };
  }

  function validate() {
    const payload = buildPayload();
    const parsed = createSpaceSchema.safeParse(payload);
    const fe: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) fe[String(issue.path[0])] ??= issue.message;
    }
    if (type === "course" && !c.size_confirmed) fe.size_confirmed = "Confirm the team size from the assignment instructions";
    setErrors(fe);
    return Object.keys(fe).length === 0 && parsed.success ? parsed.data : null;
  }

  async function onContinue(e: React.FormEvent) {
    e.preventDefault();
    const payload = validate();
    if (!payload) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setPending(true);
    try {
      const { matches: found } = await apiFetch<{ matches: Match[] }>("/api/spaces/check-duplicates", {
        method: "POST",
        json: payload,
      });
      if (found.length > 0) {
        setMatches(found);
        setStep("review");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        await create();
      }
    } catch (err) {
      toast.error((err as ApiClientError).message);
    } finally {
      setPending(false);
    }
  }

  async function create() {
    const payload = validate();
    if (!payload) return;
    setPending(true);
    try {
      const { space } = await apiFetch<{ space: { slug: string } }>("/api/spaces", { method: "POST", json: payload });
      toast.success("Space created. You're its first participant.");
      router.push(`/s/${space.slug}/setup?created=1`);
      router.refresh();
    } catch (err) {
      const e2 = err as ApiClientError;
      toast.error(e2.message);
      if (e2.code === "DUPLICATE_SPACE") setStep("form");
      setPending(false);
    }
  }

  const blocking = matches.filter((m) => m.match_kind !== "similar");
  const similar = matches.filter((m) => m.match_kind === "similar");

  if (step === "review") {
    return (
      <div className="flex flex-col gap-6">
        <button
          type="button"
          onClick={() => setStep("form")}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to the form
        </button>

        {blocking.length > 0 && (
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-6" aria-labelledby="exists-heading">
            <h2 id="exists-heading" className="flex items-center gap-2 font-medium">
              <AlertTriangle className="size-4 text-primary" aria-hidden /> This Space already exists
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Join the existing Space instead of creating a duplicate, so everyone ends up in the same candidate pool.
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {blocking.map((m) => (
                <MatchRow key={m.space_id} m={m} />
              ))}
            </ul>
          </section>
        )}

        {similar.length > 0 && (
          <section className="rounded-xl border bg-card p-4 sm:p-6" aria-labelledby="similar-heading">
            <h2 id="similar-heading" className="font-medium">
              Is it one of these?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These look similar. If one is the same event or assignment, open it. If not, create a separate Space.
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {similar.map((m) => (
                <MatchRow key={m.space_id} m={m} />
              ))}
            </ul>
          </section>
        )}

        {blocking.length === 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button onClick={create} disabled={pending}>
              {pending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
              No, it&apos;s different. Create Space
            </Button>
          </div>
        )}
      </div>
    );
  }

  const err = (k: string) => errors[k];

  return (
    <form onSubmit={onContinue} noValidate className="flex flex-col gap-6">
      <FieldGroup label="What are you forming teams for?" required>
        <div role="radiogroup" aria-label="Space type" className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { id: "hackathon", label: "Hackathon", hint: "One specific event edition, e.g. TreeHacks 2027", icon: Trophy },
              { id: "course", label: "Course project / homework", hint: "One course, term, section set and assignment", icon: GraduationCap },
            ] as const
          ).map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={type === id}
              onClick={() => {
                setType(id);
                setErrors({});
              }}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                type === id ? "border-primary bg-primary/5" : "hover:bg-muted",
              )}
            >
              <Icon className={cn("mt-0.5 size-4", type === id ? "text-primary" : "text-muted-foreground")} aria-hidden />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </FieldGroup>

      {type === "hackathon" ? (
        <div className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field id="title" label="Event name" required error={err("title")} hint="Without the year, e.g. “TreeHacks”.">
              <input id="title" className={inputClass} value={h.title} maxLength={120} onChange={(e) => setH({ ...h, title: e.target.value })} aria-invalid={!!err("title")} />
            </Field>
            <Field id="edition_year" label="Edition year" required error={err("edition_year")}>
              <input id="edition_year" type="number" inputMode="numeric" min={2000} max={2100} className={inputClass} value={h.edition_year} onChange={(e) => setH({ ...h, edition_year: e.target.value })} aria-invalid={!!err("edition_year")} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="organizer" label="Host / organizer" error={err("organizer")} hint="As entered by you. Not verified.">
              <input id="organizer" className={inputClass} value={h.organizer} maxLength={140} onChange={(e) => setH({ ...h, organizer: e.target.value })} placeholder="Stanford University" />
            </Field>
            <Field id="official_url" label="Official URL" error={err("official_url")} hint="Strongly recommended: helps others find this Space and prevents duplicates.">
              <input id="official_url" type="url" inputMode="url" className={inputClass} value={h.official_url} onChange={(e) => setH({ ...h, official_url: e.target.value })} placeholder="https://www.treehacks.com" aria-invalid={!!err("official_url")} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="start_date" label="Start date" required error={err("start_date")}>
              <input id="start_date" type="date" className={inputClass} value={h.start_date} onChange={(e) => setH({ ...h, start_date: e.target.value })} aria-invalid={!!err("start_date")} />
            </Field>
            <Field id="end_date" label="End date" required error={err("end_date")}>
              <input id="end_date" type="date" className={inputClass} value={h.end_date} min={h.start_date || undefined} onChange={(e) => setH({ ...h, end_date: e.target.value })} aria-invalid={!!err("end_date")} />
            </Field>
            <Field id="timezone" label="Event time zone" required error={err("timezone")}>
              <select id="timezone" className={inputClass} value={h.timezone} onChange={(e) => setH({ ...h, timezone: e.target.value })}>
                {timeZones(h.timezone).map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </Field>
          </div>
          <FieldGroup label="Format" required error={err("format")}>
            <Segmented
              name="format"
              options={[
                { id: "in_person", label: "In person" },
                { id: "online", label: "Online" },
                { id: "hybrid", label: "Hybrid" },
              ]}
              value={h.format}
              onChange={(x) => setH({ ...h, format: x ?? "in_person" })}
              ariaLabel="Format"
            />
          </FieldGroup>
          {h.format !== "online" && (
            <Field id="location" label="Venue / city" error={err("location")}>
              <input id="location" className={inputClass} value={h.location} maxLength={200} onChange={(e) => setH({ ...h, location: e.target.value })} placeholder="Stanford, CA" />
            </Field>
          )}
          <Field id="rules_url" label="Official rules link" error={err("rules_url")} hint="Where students can confirm eligibility and team rules.">
            <input id="rules_url" type="url" inputMode="url" className={inputClass} value={h.rules_url} onChange={(e) => setH({ ...h, rules_url: e.target.value })} placeholder="https://…" aria-invalid={!!err("rules_url")} />
          </Field>
          <TeamSizeFields
            min={h.min_team_size}
            max={h.max_team_size}
            confirmed={h.size_confirmed}
            onChange={(p) => setH({ ...h, ...p })}
            error={err("max_team_size") ?? err("min_team_size")}
            required={false}
          />
          <DeadlineField value={h.team_deadline_local} onChange={(v) => setH({ ...h, team_deadline_local: v })} error={err("team_deadline_local")} tz={h.timezone} />
          <VisibilityField value={h.visibility} onChange={(v) => setH({ ...h, visibility: v })} type="hackathon" />
        </div>
      ) : (
        <div className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="university" label="University" required error={err("university")}>
              <input id="university" className={inputClass} value={c.university} maxLength={120} onChange={(e) => setC({ ...c, university: e.target.value })} aria-invalid={!!err("university")} />
            </Field>
            <Field id="season" label="Term" required error={err("term")}>
              <select id="season" className={inputClass} value={c.season} onChange={(e) => setC({ ...c, season: e.target.value })}>
                {["Spring", "Summer", "Fall", "Winter"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field id="year" label="Year" required>
              <select id="year" className={inputClass} value={c.year} onChange={(e) => setC({ ...c, year: e.target.value })}>
                {YEARS.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field id="course_code" label="Course code" required error={err("course_code")}>
              <input id="course_code" className={inputClass} value={c.course_code} maxLength={30} onChange={(e) => setC({ ...c, course_code: e.target.value })} placeholder="CSCI 567" aria-invalid={!!err("course_code")} />
            </Field>
            <Field id="course_title" label="Course title" error={err("course_title")}>
              <input id="course_title" className={inputClass} value={c.course_title} maxLength={140} onChange={(e) => setC({ ...c, course_title: e.target.value })} placeholder="Machine Learning" />
            </Field>
          </div>
          <Field
            id="sections"
            label="Section(s)"
            required
            error={err("allowed_sections")}
            hint="Comma-separated. List several only if the instructor allows cross-section teams."
          >
            <input id="sections" className={inputClass} value={c.sections} onChange={(e) => setC({ ...c, sections: e.target.value })} placeholder="Section 1" aria-invalid={!!err("allowed_sections")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <Field id="assignment_name" label="Assignment" required error={err("assignment_name")} hint="Different homework or projects get different Spaces.">
              <input id="assignment_name" className={inputClass} value={c.assignment_name} maxLength={140} onChange={(e) => setC({ ...c, assignment_name: e.target.value })} placeholder="Final Group Project" aria-invalid={!!err("assignment_name")} />
            </Field>
            <Field id="assignment_key" label="Assignment ID" error={err("assignment_key")}>
              <input id="assignment_key" className={inputClass} value={c.assignment_key} maxLength={60} onChange={(e) => setC({ ...c, assignment_key: e.target.value })} placeholder="HW3" />
            </Field>
          </div>
          <TeamSizeFields
            min={c.min_team_size}
            max={c.max_team_size}
            confirmed={c.size_confirmed}
            onChange={(p) => setC({ ...c, ...p })}
            error={err("max_team_size") ?? err("min_team_size") ?? err("size_confirmed")}
            required
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <DeadlineField value={c.team_deadline_local} onChange={(v) => setC({ ...c, team_deadline_local: v })} error={err("team_deadline_local")} tz={c.timezone} />
            <Field id="course_tz" label="Time zone" required>
              <select id="course_tz" className={inputClass} value={c.timezone} onChange={(e) => setC({ ...c, timezone: e.target.value })}>
                {timeZones(c.timezone).map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="instructions_url" label="Assignment instructions link" error={err("instructions_url")} hint="Shown only to participants of this Space.">
            <input id="instructions_url" type="url" inputMode="url" className={inputClass} value={c.instructions_url} onChange={(e) => setC({ ...c, instructions_url: e.target.value })} placeholder="https://…" aria-invalid={!!err("instructions_url")} />
          </Field>
          <VisibilityField value={c.visibility} onChange={(v) => setC({ ...c, visibility: v })} type="course" />
        </div>
      )}

      <div className="flex gap-3 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          You&apos;ll be added as the first participant. Creating a Space does <strong>not</strong> create a team and does
          not make you an organizer. It will be labeled <em>Community-created</em>. Joining a Space is not proof of event
          registration or course enrollment.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href={`/spaces?type=${type}`} className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
          Check for duplicates &amp; create
        </Button>
      </div>
    </form>
  );
}

function MatchRow({ m }: { m: Match }) {
  const kind = { exact: "Same event / assignment", url: "Same official URL and year", similar: "Similar name" }[m.match_kind];
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{m.title}</p>
        <p className="text-xs text-muted-foreground">
          {kind} · {m.participant_count} participant{Number(m.participant_count) === 1 ? "" : "s"}
          {m.requires_code ? " · invite code required" : ""}
        </p>
      </div>
      {m.is_member && m.slug ? (
        <Link href={`/s/${m.slug}/discover`} className={buttonVariants({ size: "sm" })}>
          Go to Space
        </Link>
      ) : m.slug ? (
        <Link href={`/s/${m.slug}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
          View &amp; join
        </Link>
      ) : (
        <div className="w-full sm:w-80">
          <p className="mb-1.5 text-xs text-muted-foreground">Invite-only. Enter the code a classmate shared:</p>
          <JoinSpaceForm spaceId={m.space_id} requiresCode label="Join" compact />
        </div>
      )}
    </li>
  );
}

function TeamSizeFields({
  min,
  max,
  confirmed,
  onChange,
  error,
  required,
}: {
  min: string;
  max: string;
  confirmed: boolean;
  onChange: (p: { min_team_size?: string; max_team_size?: string; size_confirmed?: boolean }) => void;
  error?: string;
  required: boolean;
}) {
  return (
    <FieldGroup
      label="Allowed team size"
      required={required}
      error={error}
      hint={
        required
          ? "From the assignment instructions."
          : "Only if you can confirm it from the official rules. Otherwise the app uses a provisional 2–4, clearly labeled unverified."
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="min_team_size" className="sr-only">Minimum team size</label>
        <input id="min_team_size" type="number" inputMode="numeric" min={1} max={20} className={cn(inputClass, "w-20")} value={min} onChange={(e) => onChange({ min_team_size: e.target.value })} placeholder="Min" />
        <span className="text-sm text-muted-foreground">to</span>
        <label htmlFor="max_team_size" className="sr-only">Maximum team size</label>
        <input id="max_team_size" type="number" inputMode="numeric" min={1} max={20} className={cn(inputClass, "w-20")} value={max} onChange={(e) => onChange({ max_team_size: e.target.value })} placeholder="Max" />
        <span className="text-sm text-muted-foreground">people</span>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={confirmed} onChange={(e) => onChange({ size_confirmed: e.target.checked })} />
        <span>I confirmed this team size from the official {required ? "assignment instructions" : "rules"}.</span>
      </label>
    </FieldGroup>
  );
}

function DeadlineField({ value, onChange, error, tz }: { value: string; onChange: (v: string) => void; error?: string; tz: string }) {
  return (
    <Field id="team_deadline_local" label="Team formation deadline" error={error} hint={`Leave empty if unknown. Time zone: ${tz.replace(/_/g, " ")}.`}>
      <input id="team_deadline_local" type="datetime-local" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function VisibilityField({ value, onChange, type }: { value: string; onChange: (v: string) => void; type: SpaceType }) {
  return (
    <FieldGroup
      label="Who can find this Space?"
      required
      hint={type === "course" ? "Course Spaces default to invite-only so classmates outside the course can't browse it." : undefined}
    >
      <Segmented
        name="visibility"
        layout="cards"
        options={[
          { id: "public", label: "Public", hint: "Listed in search; anyone signed in can join." },
          { id: "unlisted", label: "Invite-only", hint: "Hidden from search; joining needs the link and a join code." },
        ]}
        value={value}
        onChange={(v) => onChange(v ?? value)}
        ariaLabel="Visibility"
      />
    </FieldGroup>
  );
}
