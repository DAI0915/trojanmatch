import Link from "next/link";
import { ChevronRight, Crown, UsersRound } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { TeamStatusBadge } from "@/components/team/team-badges";
import type { TeamStatus } from "@/lib/teams";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function MyTeamsPage() {
  const { supabase, user } = await getCurrentUser();
  const { data: rows } = await supabase
    .from("team_members")
    .select("role, team:teams(id, name, status, target_size, team_members(status), space:matching_spaces(title, slug))")
    .eq("user_id", user!.id)
    .eq("status", "active");
  type Row = {
    role: string;
    team: { id: string; name: string; status: TeamStatus; target_size: number; team_members: { status: string }[]; space: { title: string; slug: string } | null } | null;
  };
  const teams = ((rows ?? []) as unknown as Row[]).filter((r) => r.team?.space);

  return (
    <>
      <PageHeader title="My Teams" description="Teams you belong to, across your Spaces. A team becomes Active only after members accept." />
      {teams.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No teams yet"
          description="Creating a Space never creates a team. Join a Space first, then create or join a team there."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {teams.map(({ role, team }) => {
            const members = team!.team_members.filter((m) => m.status === "active").length;
            return (
              <li key={team!.id}>
                <Link
                  href={`/s/${team!.space!.slug}/teams/${team!.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{team!.name}</span>
                      {role === "owner" && <Crown className="size-3.5 shrink-0 text-muted-foreground" aria-label="Owner" />}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{team!.space!.title}</p>
                  </div>
                  <span className="hidden text-sm text-muted-foreground sm:inline">
                    {members}/{team!.target_size}
                  </span>
                  <TeamStatusBadge status={team!.status} />
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
