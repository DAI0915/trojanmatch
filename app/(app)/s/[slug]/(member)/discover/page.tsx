import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Plus, Settings2, Sparkles, UserRound, Users, UsersRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { InviteLinkCard } from "@/components/space/invite-link-card";
import { SpaceFacts, SpaceHeader } from "@/components/space/space-header";
import { getSpace } from "@/lib/spaces";
import { teamsInSpace } from "@/lib/teams";
import { TeamCard } from "@/components/team/team-card";
import { getCurrentUser } from "@/lib/supabase/server";
import { goalLabel, roleLabel } from "@/lib/taxonomy";
import { plural } from "@/lib/format";

export default async function DiscoverPage({ params }: PageProps<"/s/[slug]/discover">) {
  const { slug } = await params;
  const space = await getSpace(slug);
  if (!space) notFound();

  const { supabase, user } = await getCurrentUser();
  const [{ data: part }, { data: profile }] = await Promise.all([
    supabase
      .from("participations")
      .select("goal, desired_roles, looking_for_team, accept_invites, smart_match_opt_in, visible_to_members, setup_completed")
      .eq("space_id", space.id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase.from("profiles").select("onboarded").eq("id", user!.id).maybeSingle(),
  ]);
  if (!part) notFound();

  const { myTeam, recruiting } = await teamsInSpace(space.id, user!.id);
  const count = Number(space.participant_count);
  const alone = count <= 1;

  return (
    <>
      <SpaceHeader space={space} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          {alone ? (
            <section className="rounded-xl border border-dashed bg-card p-6 text-center" aria-labelledby="cold-heading">
              <Sparkles className="mx-auto mb-2 size-6 text-primary" aria-hidden />
              <h2 id="cold-heading" className="text-lg font-semibold">You&apos;re the first one here!</h2>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="participant-count">
                1 member (you) · No teammates available yet
              </p>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                Matching only uses people who have joined this Space, so there&apos;s nobody to suggest yet. Share the
                invite link below, set up your preferences, and check back after others join.
              </p>
            </section>
          ) : (
            <section className="rounded-xl border bg-card p-5" aria-labelledby="members-heading">
              <h2 id="members-heading" className="flex items-center gap-2 font-medium">
                <Users className="size-4 text-primary" aria-hidden /> Who&apos;s here
              </h2>
              <p className="mt-1 text-sm text-muted-foreground" data-testid="participant-count">
                {plural(count, "participant")} in this Space
                {Number(space.synthetic_participant_count) > 0 ? ` (${space.synthetic_participant_count} synthetic)` : ""}
                {space.recruiting_team_count > 0 ? ` · ${plural(Number(space.recruiting_team_count), "team")} recruiting` : ""}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Each student chooses whether their profile is visible and whether they can be suggested.
              </p>
            </section>
          )}

          <nav aria-label="Find your team" className="grid gap-3 sm:grid-cols-3">
            {[
              { href: `/s/${space.slug}/find`, title: "Find a Team", body: "Recruiting teams ranked by fit with you. Request to join." },
              { href: `/s/${space.slug}/grow`, title: "Grow My Team", body: "See your team's gaps and who could fill them." },
              { href: `/s/${space.slug}/smart`, title: "Smart Team Formation", body: "Let AI propose a complete, balanced team." },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
                <span className="block font-medium">{c.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{c.body}</span>
              </Link>
            ))}
          </nav>

          <section className="rounded-xl border bg-card p-5" aria-labelledby="team-heading">
            <div className="flex items-center justify-between gap-2">
              <h2 id="team-heading" className="flex items-center gap-2 font-medium">
                <UsersRound className="size-4 text-primary" aria-hidden /> Your team
              </h2>
              <Link href={`/s/${space.slug}/teams`} className="text-sm text-primary underline-offset-4 hover:underline">
                All teams{recruiting.length ? ` (${recruiting.length} recruiting)` : ""}
              </Link>
            </div>
            {myTeam ? (
              <div className="mt-3 sm:max-w-md">
                <TeamCard team={myTeam} href={`/s/${space.slug}/teams/${myTeam.id}`} />
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">You&apos;re not on a team in this Space yet.</p>
                {space.status === "open" && (
                  <Link href={`/s/${space.slug}/teams/new`} className={buttonVariants({ size: "sm" })}>
                    <Plus data-icon="inline-start" aria-hidden /> Create a team
                  </Link>
                )}
              </div>
            )}
          </section>

          <InviteLinkCard spaceId={space.id} emphasize={alone} />
          <SpaceFacts space={space} />
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="mine-heading">
            <h2 id="mine-heading" className="font-medium">Your participation</h2>
            {!part.setup_completed && (
              <p className="mt-1 rounded-md bg-brand-gold/10 px-2.5 py-1.5 text-xs">You haven&apos;t set your preferences for this Space yet.</p>
            )}
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Goal</dt>
                <dd className="text-right">{goalLabel(space.type, part.goal) ?? "Not set"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Roles</dt>
                <dd className="text-right">{part.desired_roles.length ? part.desired_roles.map(roleLabel).join(", ") : "Not set"}</dd>
              </div>
            </dl>
            <ul className="mt-3 flex flex-col gap-1.5 border-t pt-3 text-sm" aria-label="Consent settings">
              <ConsentRow on={part.looking_for_team} label="Looking for a team" />
              <ConsentRow on={part.visible_to_members} label="Profile visible to members" />
              <ConsentRow on={part.accept_invites} label="Accepting invitations" />
              <ConsentRow on={part.smart_match_opt_in} label="In AI team suggestions" />
            </ul>
            <Link href={`/s/${space.slug}/setup`} className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-4 w-full`}>
              <Settings2 data-icon="inline-start" aria-hidden /> {part.setup_completed ? "Edit preferences" : "Set preferences"}
            </Link>
          </section>
          {profile && !profile.onboarded && (
            <Link href="/profile?welcome=1" className="flex items-center gap-2 rounded-xl border border-brand-gold/60 bg-brand-gold/10 p-4 text-sm hover:bg-brand-gold/20">
              <UserRound className="size-4 shrink-0" aria-hidden /> Complete your global profile so teammates know what you bring.
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}

function ConsentRow({ on, label }: { on: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {on ? <CheckCircle2 className="size-4 text-primary" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}
      <span className={on ? "" : "text-muted-foreground"}>{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{on ? "On" : "Off"}</span>
    </li>
  );
}
