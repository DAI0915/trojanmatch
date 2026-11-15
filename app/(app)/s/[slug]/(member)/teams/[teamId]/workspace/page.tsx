import { PersonAvatar } from "@/components/ui/person-avatar";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { TeamStatusBadge } from "@/components/team/team-badges";
import { KickoffPanel } from "@/components/workspace/kickoff-panel";
import { TeamChat } from "@/components/workspace/team-chat";
import { WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import { getSpace } from "@/lib/spaces";
import { getCurrentUser } from "@/lib/supabase/server";
import { loadWorkspace } from "@/lib/workspace";

export default async function WorkspacePage({ params }: PageProps<"/s/[slug]/teams/[teamId]/workspace">) {
  const { slug, teamId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(teamId)) notFound();
  const space = await getSpace(slug);
  if (!space) notFound();
  const { user } = await getCurrentUser();
  const access = await loadWorkspace(teamId, user!.id);

  if (!access.ok) {
    if (access.reason === "not_found") notFound();
    // Never render any team content to non-members or before activation.
    return (
      <section role="alert" className="mx-auto mt-8 max-w-lg rounded-xl border bg-card p-6 text-center" data-testid="workspace-denied">
        <Lock className="mx-auto mb-3 size-6 text-muted-foreground" aria-hidden />
        <h1 className="text-lg font-semibold">
          {access.reason === "not_active" ? "The workspace opens when the team is Active" : "This workspace is only for the team's members"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {access.reason === "not_active"
            ? "Chat and AI Kickoff unlock once enough members have accepted and no invitation is pending, or the owner finalizes the team."
            : "Only accepted members of an active team can read or send messages. Being in the same Space, being invited, or creating the Space doesn't give access."}
        </p>
        <Link href={`/s/${slug}/teams/${teamId}`} className={`${buttonVariants({ variant: "outline" })} mt-4`}>Back to team</Link>
      </section>
    );
  }
  const w = access.workspace;
  if (w.space.id !== space.id) notFound();
  const memberNames = w.members.map((m) => ({ id: m.id, name: m.name }));

  return (
    <>
      <Link href={`/s/${slug}/teams/${w.team.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Team details
      </Link>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground" data-testid="workspace-space">{w.space.title}</p>
          <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]" data-testid="workspace-title">{w.team.name}</h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <TeamStatusBadge status={w.team.status} />
          <Badge variant="outline" className="font-normal">{w.members.length} members</Badge>
        </div>
      </header>

      <WorkspaceTabs
        team={
          <section aria-labelledby="ws-members" className="rounded-xl border bg-card p-4" data-testid="workspace-members">
            <h2 id="ws-members" className="font-medium">Members</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {w.members.map((m) => (
                <li key={m.id} className="text-sm">
                  <span className="flex items-center gap-2">
                    <PersonAvatar name={m.name} size="sm" />
                    <span className="min-w-0 truncate font-medium">{m.name}{m.id === user!.id ? " (you)" : ""}</span>
                    {m.owner && <Crown className="size-3 shrink-0 text-muted-foreground" aria-label="Owner" />}
                  </span>
                  <span className="mt-1 block pl-9 text-xs text-primary">{m.roles.join(", ") || "Role not set"}</span>
                  {m.skills.length > 0 && <span className="block pl-9 text-xs text-muted-foreground">{m.skills.join(" · ")}</span>}
                  {m.synthetic && <Badge variant="outline" className="ml-9 mt-1 h-4 px-1 text-[10px]">Synthetic</Badge>}
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              <p>Team fit: <span className="font-medium text-foreground">{w.fit.band} ({w.fit.score.toFixed(2)})</span></p>
              <p>{w.fit.schedule.sharedHours} h/week when everyone is free</p>
              {w.fit.schedule.windows.slice(0, 2).map((x) => <p key={x}>{x}</p>)}
            </div>
          </section>
        }
        chat={<TeamChat teamId={w.team.id} meId={user!.id} members={memberNames} initial={w.messages} />}
        kickoff={
          <KickoffPanel
            teamId={w.team.id}
            initial={w.kickoff}
            members={memberNames}
            fit={{ score: w.fit.score, band: w.fit.band, sharedHours: w.fit.schedule.sharedHours }}
          />
        }
      />
    </>
  );
}
