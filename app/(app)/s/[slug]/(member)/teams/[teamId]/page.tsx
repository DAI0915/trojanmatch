import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown, Inbox, MessagesSquare, Pencil, Sparkles, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { CancelInvitationButton, FinalizeTeamButton, RequestToJoinButton } from "@/components/invite/invitation-actions";
import { StatusTimeline, TeamInvitations } from "@/components/invite/team-invitations";
import { RequirementsView } from "@/components/team/requirements-view";
import { RecruitingBadge, TeamStatusBadge } from "@/components/team/team-badges";
import { expiresIn } from "@/lib/format";
import { effectiveStatus, loadTeamInvitations, myOpenInvitation } from "@/lib/invitations";
import { getSpace } from "@/lib/spaces";
import { teamDetail, teamsInSpace } from "@/lib/teams";
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
  const { team, members, canRecruit, isMember, isOwner, activationMode } = detail;

  const invitations = isMember ? await loadTeamInvitations(team.id) : [];
  const pendingInvites = invitations.filter((i) => i.kind === "invite" && effectiveStatus(i) === "pending");
  const reserved = pendingInvites.length;
  const openSeats = Math.max(team.target_size - team.members - reserved, 0);
  const minNeeded = Math.max(space.min_team_size, 2);
  const spaceOpen = space.status === "open" && (!space.team_deadline_at || new Date(space.team_deadline_at) > new Date());
  const canFinalize = isOwner && spaceOpen && (team.status === "draft" || team.status === "forming") && team.members >= minNeeded;

  // Visitors (not on this team): own pending request/invitation, and whether they may ask to join.
  const mine = !isMember ? await myOpenInvitation(team.id, user!.id) : null;
  const { myTeam } = !isMember ? await teamsInSpace(space.id, user!.id) : { myTeam: null };
  const canRequest = !isMember && !myTeam && !mine && spaceOpen && team.recruiting && team.status !== "archived" && team.target_size - team.members > 0;

  return (
    <>
      <Link href={`/s/${slug}/teams`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Teams in {space.title}
      </Link>
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">{team.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="team-badges">
            <TeamStatusBadge status={team.status} />
            <RecruitingBadge recruiting={team.recruiting} open={Math.max(team.target_size - team.members, 0)} />
            {isMember && <Badge variant="secondary" className="font-normal">You&apos;re a member</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isMember && team.status === "active" && (
            <Link href={`/s/${slug}/teams/${team.id}/workspace`} className={buttonVariants()}>
              <MessagesSquare data-icon="inline-start" aria-hidden /> Open workspace
            </Link>
          )}
          {canRecruit && team.status !== "archived" && (
            <>
              <Link href={`/s/${slug}/grow`} className={buttonVariants({ variant: team.status === "active" ? "outline" : "default" })}>
                <Sparkles data-icon="inline-start" aria-hidden /> Grow my team
              </Link>
              <Link href={`/s/${slug}/teams/${team.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                <Pencil data-icon="inline-start" aria-hidden /> Edit team
              </Link>
            </>
          )}
          {canFinalize && <FinalizeTeamButton teamId={team.id} accepted={team.members} pendingNames={pendingInvites.map((i) => i.person.name ?? "A student")} />}
          {canRequest && <RequestToJoinButton teamId={team.id} teamName={team.name} size="default" />}
        </div>
      </header>

      {mine && (
        <section role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4" data-testid="my-open-invitation">
          <p className="text-sm">
            {mine.kind === "request"
              ? `You asked to join this team. The owner or a recruiter will answer (expires ${expiresIn(mine.expires_at)}).`
              : `This team invited you (expires ${expiresIn(mine.expires_at)}).`}
          </p>
          {mine.kind === "request" ? (
            <CancelInvitationButton invitationId={mine.id} label="Withdraw request" ariaLabel={`Withdraw request to ${team.name}`} />
          ) : (
            <Link href="/invitations" className={buttonVariants({ size: "sm" })}>
              <Inbox data-icon="inline-start" aria-hidden /> Respond in Invitations
            </Link>
          )}
        </section>
      )}
      {!isMember && myTeam && team.recruiting && (
        <p className="mb-6 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          You&apos;re already on “{myTeam.name}” in this Space. You can be on one team per Space.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          {isMember && (
            <StatusTimeline status={team.status} minSize={space.min_team_size} accepted={team.members} pending={reserved} activationMode={activationMode} />
          )}
          {team.description && (
            <section className="rounded-xl border bg-card p-4 sm:p-5">
              <h2 className="mb-1 text-sm font-medium text-muted-foreground">About</h2>
              <p className="whitespace-pre-line [overflow-wrap:anywhere]">{team.description}</p>
            </section>
          )}
          {isMember && (
            <TeamInvitations invitations={invitations} slug={slug} canRecruit={canRecruit} teamName={team.name} openSeats={openSeats} />
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
              {team.members} of {team.target_size} · {Math.max(team.target_size - team.members, 0)} open position{team.target_size - team.members === 1 ? "" : "s"}
            </p>
            {isMember && reserved > 0 && (
              <p className="text-xs text-muted-foreground" data-testid="team-reserved">{reserved} reserved by pending invitations</p>
            )}
            <ul className="mt-3 flex flex-col gap-2" data-testid="member-list">
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
            <p className="mt-3 text-xs text-muted-foreground">Members are added only when they accept an invitation, or when the team accepts their request.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
