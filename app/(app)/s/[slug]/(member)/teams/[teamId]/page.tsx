import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown, Pencil, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { RequirementsView } from "@/components/team/requirements-view";
import { RecruitingBadge, TeamStatusBadge } from "@/components/team/team-badges";
import { getSpace } from "@/lib/spaces";
import { teamDetail } from "@/lib/teams";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function TeamDetailPage({ params }: PageProps<"/s/[slug]/teams/[teamId]">) {
  const { slug, teamId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(teamId)) notFound();
  const space = await getSpace(slug);
  if (!space) notFound();
  const { user } = await getCurrentUser();
  const detail = await teamDetail(teamId, user!.id);
  // RLS hides teams you may not see; also never show a team under another Space's URL.
  if (!detail || detail.spaceId !== space.id) notFound();
  const { team, members, canRecruit, isMember } = detail;
  const open = Math.max(team.target_size - team.members, 0);

  return (
    <>
      <Link href={`/s/${slug}/teams`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Teams in {space.title}
      </Link>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{team.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <TeamStatusBadge status={team.status} />
            <RecruitingBadge recruiting={team.recruiting} open={open} />
            {isMember && <Badge variant="secondary" className="font-normal">You&apos;re a member</Badge>}
          </div>
        </div>
        {canRecruit && (
          <Link href={`/s/${slug}/teams/${team.id}/edit`} className={buttonVariants({ variant: "outline" })}>
            <Pencil data-icon="inline-start" aria-hidden /> Edit team
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          {team.description && (
            <section className="rounded-xl border bg-card p-4 sm:p-5">
              <h2 className="mb-1 text-sm font-medium text-muted-foreground">About</h2>
              <p className="whitespace-pre-line [overflow-wrap:anywhere]">{team.description}</p>
            </section>
          )}
          <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="req-heading">
            <h2 id="req-heading" className="mb-3 font-medium">Recruiting for</h2>
            <RequirementsView requirements={team.requirements} spaceType={space.type} />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="members-heading">
            <h2 id="members-heading" className="font-medium">Members</h2>
            <p className="mt-0.5 text-sm text-muted-foreground" data-testid="team-capacity">
              {team.members} of {team.target_size} · {open} open position{open === 1 ? "" : "s"}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2 text-sm">
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted">
                    <UserRound className="size-3.5" aria-hidden />
                  </span>
                  <span className="min-w-0 truncate">{m.name ?? "Member (profile not shared with you)"}</span>
                  {m.synthetic && <Badge variant="outline" className="h-4 px-1 text-[10px]">Synthetic</Badge>}
                  {m.role === "owner" && (
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Crown className="size-3" aria-hidden /> Owner
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Members are added only when they accept an invitation. Invitations open in a later update.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
