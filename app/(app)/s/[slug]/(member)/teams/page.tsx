import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, UsersRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SpaceHeader } from "@/components/space/space-header";
import { TeamCard } from "@/components/team/team-card";
import { getSpace } from "@/lib/spaces";
import { teamsInSpace } from "@/lib/teams";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function SpaceTeamsPage({ params }: PageProps<"/s/[slug]/teams">) {
  const { slug } = await params;
  const space = await getSpace(slug);
  if (!space) notFound();
  const { user } = await getCurrentUser();
  const { myTeam, recruiting } = await teamsInSpace(space.id, user!.id);
  const canCreate = !myTeam && space.status === "open" && (!space.team_deadline_at || new Date(space.team_deadline_at) > new Date());

  return (
    <>
      <SpaceHeader space={space} />
      <section aria-labelledby="your-team" className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="your-team" className="text-lg font-semibold">Your team</h2>
          {myTeam?.canRecruit && (
            <Link href={`/s/${slug}/teams/${myTeam.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Edit team
            </Link>
          )}
        </div>
        {myTeam ? (
          <div className="sm:max-w-md">
            <TeamCard team={myTeam} href={`/s/${slug}/teams/${myTeam.id}`} />
          </div>
        ) : (
          <EmptyState
            icon={UsersRound}
            title="You're not on a team in this Space"
            description={
              canCreate
                ? "Create a team and set what you're recruiting for. You'll be its owner; nobody joins until they accept."
                : "New teams can't be created here right now (the Space is closed or past its deadline)."
            }
          >
            {canCreate && (
              <Link href={`/s/${slug}/teams/new`} className={buttonVariants()}>
                <Plus data-icon="inline-start" aria-hidden /> Create a team
              </Link>
            )}
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="recruiting-teams">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="recruiting-teams" className="mb-1 text-lg font-semibold">Recruiting teams</h2>
            <p className="text-sm text-muted-foreground">Teams in this Space that are currently looking for members.</p>
          </div>
          <Link href={`/s/${slug}/find`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Find a Team: filter &amp; rank by fit
          </Link>
        </div>
        {recruiting.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No other teams are recruiting in this Space yet.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recruiting.map((t) => (
              <li key={t.id}>
                <TeamCard team={t} href={`/s/${slug}/teams/${t.id}`} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
