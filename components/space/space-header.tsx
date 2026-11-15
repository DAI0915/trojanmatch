import { ExternalLink, GraduationCap, Trophy } from "lucide-react";
import type { SpaceDetail } from "@/lib/spaces";
import { FORMAT_LABEL, formatDateRange, formatDateTime, plural, teamSizeLabel } from "@/lib/format";
import { CommunityBadge, InviteOnlyBadge, StatusBadge, UnverifiedSizeBadge } from "./space-badges";

export function SpaceHeader({ space: s }: { space: SpaceDetail }) {
  const Icon = s.type === "course" ? GraduationCap : Trophy;
  return (
    <header className="mb-6 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {s.type === "course" ? "Course project Space" : "Hackathon Space"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{s.title}</h1>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <CommunityBadge />
        {s.team_size_source === "app_default" && <UnverifiedSizeBadge />}
        {s.requires_code && <InviteOnlyBadge />}
        <StatusBadge status={s.status} />
      </div>
    </header>
  );
}

export function SpaceFacts({ space: s }: { space: SpaceDetail }) {
  const facts: { label: string; value: React.ReactNode }[] = [];
  if (s.hackathon) {
    const h = s.hackathon;
    facts.push({ label: "Dates", value: formatDateRange(h.starts_at, h.ends_at, h.timezone) });
    facts.push({ label: "Format", value: FORMAT_LABEL[h.format] + (h.location ? ` · ${h.location}` : "") });
    if (h.organizer) facts.push({ label: "Host", value: `${h.organizer} (as entered by a student)` });
    if (h.official_url) facts.push({ label: "Official site", value: <ExtLink href={h.official_url} /> });
    if (h.rules_url) facts.push({ label: "Rules", value: <ExtLink href={h.rules_url} /> });
  }
  if (s.course) {
    const c = s.course;
    facts.push({ label: "Course", value: `${c.course_code}${c.course_title ? ` · ${c.course_title}` : ""}` });
    facts.push({ label: "University / term", value: `${c.university} · ${c.term}` });
    facts.push({ label: "Sections", value: c.allowed_sections.join(", ") });
    facts.push({ label: "Assignment", value: `${c.assignment_name}${c.assignment_key ? ` (${c.assignment_key})` : ""}` });
    if (c.instructions_url) facts.push({ label: "Instructions", value: <ExtLink href={c.instructions_url} /> });
  }
  facts.push({
    label: "Team size",
    value:
      teamSizeLabel(s.min_team_size, s.max_team_size) +
      (s.team_size_source === "app_default" ? " (provisional app default, not a confirmed rule)" : " (stated by the Space creator)"),
  });
  facts.push({
    label: "Team deadline",
    value: s.team_deadline_at ? formatDateTime(s.team_deadline_at, s.hackathon?.timezone) : "Unknown",
  });
  facts.push({ label: "Participants", value: plural(Number(s.participant_count), "student") });

  return (
    <dl className="grid gap-x-6 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2 sm:p-5">
      {facts.map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{f.label}</dt>
          <dd className="mt-0.5 [overflow-wrap:anywhere]">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExtLink({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
      {href.replace(/^https?:\/\//, "").replace(/\/$/, "")}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
