import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { TeamForm } from "@/components/team/team-form";
import { getSpace } from "@/lib/spaces";
import { teamsInSpace } from "@/lib/teams";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function NewTeamPage({ params }: PageProps<"/s/[slug]/teams/new">) {
  const { slug } = await params;
  const space = await getSpace(slug);
  if (!space) notFound();
  const { user } = await getCurrentUser();
  const { myTeam } = await teamsInSpace(space.id, user!.id);
  if (myTeam) redirect(`/s/${slug}/teams/${myTeam.id}`); // one team per Space

  const minTarget = Math.max(space.min_team_size, 2);
  return (
    <>
      <Link href={`/s/${slug}/teams`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Teams in {space.title}
      </Link>
      <PageHeader title="Create a team" description={`For ${space.title}. You'll be the owner; set what you're recruiting for.`} />
      <TeamForm
        mode="create"
        slug={slug}
        spaceId={space.id}
        spaceType={space.type}
        minTeamSize={space.min_team_size}
        maxTeamSize={space.max_team_size}
        currentMembers={1}
        initial={{
          name: "",
          description: "",
          open_positions: Math.min(Math.max(minTarget - 1, 1), space.max_team_size - 1),
          recruiting: true,
          must_roles: [],
          preferred_roles: [],
          skills: [],
          topics: [],
          goal: null,
          min_shared_hours: "",
          note: "",
        }}
      />
    </>
  );
}
