import Link from "next/link";
import { Users } from "lucide-react";
import type { TeamSummary } from "@/lib/teams";
import { roleLabel } from "@/lib/taxonomy";
import { RecruitingBadge, TeamStatusBadge } from "./team-badges";

export function TeamCard({ team, href }: { team: TeamSummary; href: string }) {
  const open = Math.max(team.target_size - team.members, 0);
  const must = team.requirements.must_roles ?? [];
  return (
    <Link
      href={href}
      className="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-medium [overflow-wrap:anywhere]">{team.name}</p>
        <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
          <Users className="size-3.5" aria-hidden />
          <span>
            {team.members}/{team.target_size}
            <span className="sr-only"> members</span>
          </span>
        </span>
      </div>
      {team.description && <p className="line-clamp-2 text-sm text-muted-foreground">{team.description}</p>}
      {must.length > 0 && (
        <p className="text-xs">
          <span className="text-muted-foreground">Needs: </span>
          {must.map(roleLabel).join(", ")}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5">
        <TeamStatusBadge status={team.status} />
        <RecruitingBadge recruiting={team.recruiting} open={open} />
      </div>
    </Link>
  );
}
