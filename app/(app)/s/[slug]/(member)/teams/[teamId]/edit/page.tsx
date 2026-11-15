import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { TeamForm } from "@/components/team/team-form";
import { teamFormValueFrom } from "@/lib/team-form-value";
import { getSpace } from "@/lib/spaces";
import { teamDetail } from "@/lib/teams";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function EditTeamPage({ params }: PageProps<"/s/[slug]/teams/[teamId]/edit">) {
  const { slug, teamId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(teamId)) notFound();
  const space = await getSpace(slug);
  if (!space) notFound();
  const { user } = await getCurrentUser();
  const detail = await teamDetail(teamId, user!.id);
  if (!detail || detail.spaceId !== space.id) notFound();
  // Only the owner or a delegated recruiter may edit (the RPC enforces this too).
  if (!detail.canRecruit) redirect(`/s/${slug}/teams/${teamId}`);
  const { team } = detail;

  return (
    <>
      <Link href={`/s/${slug}/teams/${team.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {team.name}
      </Link>
      <PageHeader title="Edit team" description="Update what you're recruiting for. Changes are visible to participants of this Space." />
      <TeamForm
        mode="edit"
        slug={slug}
        spaceId={space.id}
        teamId={team.id}
        spaceType={space.type}
        minTeamSize={space.min_team_size}
        maxTeamSize={space.max_team_size}
        currentMembers={team.members}
        initial={teamFormValueFrom({ ...team, open: Math.max(team.target_size - team.members, 0) })}
      />
    </>
  );
}
