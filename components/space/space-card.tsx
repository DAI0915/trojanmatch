import Link from "next/link";
import { CalendarDays, CheckCircle2, GraduationCap, MapPin, Trophy, Users } from "lucide-react";
import { FORMAT_LABEL, formatDateRange, plural, teamSizeLabel } from "@/lib/format";
import { CommunityBadge, InviteOnlyBadge, StatusBadge, UnverifiedSizeBadge } from "./space-badges";

export type SpaceSummary = {
  id: string;
  slug: string;
  title: string;
  type: "hackathon" | "course";
  status: string;
  visibility: string;
  join_policy: string;
  edition_year: number | null;
  starts_at: string | null;
  ends_at: string | null;
  event_timezone: string | null;
  format: string | null;
  organizer: string | null;
  university: string | null;
  term: string | null;
  course_code: string | null;
  assignment_name: string | null;
  allowed_sections: string[] | null;
  min_team_size: number;
  max_team_size: number;
  team_size_source: string;
  participant_count: number;
  is_member: boolean;
};

export function SpaceCard({ space: s }: { space: SpaceSummary }) {
  const Icon = s.type === "course" ? GraduationCap : Trophy;
  const href = s.is_member ? `/s/${s.slug}/discover` : `/s/${s.slug}`;
  return (
    <Link
      href={href}
      className="group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug group-hover:text-primary">{s.title}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {s.type === "hackathon"
              ? [s.organizer, s.format ? FORMAT_LABEL[s.format] : null].filter(Boolean).join(" · ") || "Hackathon"
              : [s.university, s.allowed_sections?.length ? `Section ${s.allowed_sections.join(", ")}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {s.is_member && (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
            <CheckCircle2 className="size-3.5" aria-hidden /> Joined
          </span>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
        {s.type === "hackathon" && s.starts_at && (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden />
            <dt className="sr-only">Dates</dt>
            <dd>{formatDateRange(s.starts_at, s.ends_at, s.event_timezone)}</dd>
          </div>
        )}
        {s.type === "course" && s.term && (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" aria-hidden />
            <dt className="sr-only">Term</dt>
            <dd>{s.term}</dd>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden />
          <dt className="sr-only">Participants</dt>
          <dd>{plural(Number(s.participant_count), "participant")}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="size-3.5" aria-hidden />
          <dt className="sr-only">Team size</dt>
          <dd>{teamSizeLabel(s.min_team_size, s.max_team_size)}</dd>
        </div>
      </dl>
      <div className="mt-auto flex flex-wrap gap-1.5">
        <CommunityBadge />
        {s.team_size_source === "app_default" && <UnverifiedSizeBadge />}
        {s.join_policy === "code" && <InviteOnlyBadge />}
        <StatusBadge status={s.status} />
      </div>
    </Link>
  );
}
