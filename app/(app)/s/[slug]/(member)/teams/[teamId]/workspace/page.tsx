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

  const others = w.members.filter((m) => m.id !== user!.id);

  return (
    <>
      <header data-wide-page className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/s/${slug}/teams/${w.team.id}`}
            aria-label="Back to the team page"
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ArrowLeft aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight" data-testid="workspace-title">{w.team.name}</h1>
            <p className="truncate text-xs text-muted-foreground" data-testid="workspace-space">{w.space.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex gap-0.5 lg:hidden" aria-hidden>
            {w.members.slice(0, 5).map((m) => (
              <PersonAvatar key={m.id} name={m.name} size="sm" className="ring-2 ring-background" />
            ))}
          </span>
          <Badge variant="outline" className="font-normal">{w.members.length} members</Badge>
          <TeamStatusBadge status={w.team.status} />
        </div>
      </header>

      <WorkspaceTabs
        sidebar={
          <section aria-labelledby="ws-members" className="rounded-xl border bg-card p-3" data-testid="workspace-members">
            <h2 id="ws-members" className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Members · {w.members.length}
            </h2>
            <ul className="mt-2 flex flex-col">
              {w.members.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm">
                  <PersonAvatar name={m.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate font-medium">{m.name}{m.id === user!.id ? " (you)" : ""}</span>
                      {m.owner && <Crown className="size-3 shrink-0 text-muted-foreground" aria-label="Owner" />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.roles.join(", ") || "Role not set"}
                      {m.synthetic && " · Synthetic"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <Link href={`/s/${slug}/teams/${w.team.id}`} className="mt-2 block px-1 text-xs font-medium text-primary underline-offset-2 hover:underline">
              Team page
            </Link>
          </section>
        }
        chat={
          <TeamChat
            teamId={w.team.id}
            meId={user!.id}
            members={memberNames}
            initial={w.messages}
            othersNames={others.map((m) => m.name)}
          />
        }
        kickoff={
          <KickoffPanel
            teamId={w.team.id}
            initial={w.kickoff}
            members={memberNames}
            fit={{ score: w.fit.score, band: w.fit.band, sharedHours: w.fit.schedule.sharedHours }}
          />
        }
        details={
          <section aria-labelledby="ws-details" className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5" data-testid="workspace-details">
            <h2 id="ws-details" className="font-medium">Team details</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">Team fit</dt>
                <dd className="font-medium">{w.fit.band} ({w.fit.score.toFixed(2)})</dd>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">Shared availability</dt>
                <dd className="font-medium">{w.fit.schedule.sharedHours} h/week when everyone is free</dd>
              </div>
            </dl>
            {w.fit.schedule.windows.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">When everyone is free</h3>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {w.fit.schedule.windows.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
            )}
            <div>
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Skills</h3>
              <ul className="flex flex-col gap-1.5 text-sm">
                {w.members.map((m) => (
                  <li key={m.id}>
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-foreground"> · {m.skills.length ? m.skills.join(", ") : "No skills shared"}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        }
      />
    </>
  );
}
