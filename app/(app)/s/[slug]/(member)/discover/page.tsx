import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FlaskConical, Info, MessagesSquare, Search, Settings2, Share2, Sparkles, UserPlus, UserRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ActionCard, Disclosure } from "@/components/space/discover-blocks";
import { InviteLinkCard } from "@/components/space/invite-link-card";
import { SpaceFacts } from "@/components/space/space-header";
import { getSpace } from "@/lib/spaces";
import { teamsInSpace } from "@/lib/teams";
import { getCurrentUser } from "@/lib/supabase/server";
import { goalLabel, roleLabel } from "@/lib/taxonomy";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", forming: "Forming", active: "Active", archived: "Archived" };

/**
 * Discover: "what can I do here?" in one column.
 *   1. Space title + one stats line
 *   2. Three primary actions (Build / Find / Grow), stacked, full width
 *   3. Your team (only when you're on one)
 *   4. Compact participation summary + Edit preferences
 *   5. Event details and Share this Space, collapsed by default
 */
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

  const { myTeam } = await teamsInSpace(space.id, user!.id);
  const count = Number(space.participant_count);
  const recruitingCount = Number(space.recruiting_team_count);
  const alone = count <= 1;
  const base = `/s/${space.slug}`;

  const stats = alone
    ? "1 member (you) · No teammates available yet"
    : [plural(count, "participant"), recruitingCount > 0 ? `${plural(recruitingCount, "team")} recruiting` : null].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-[60rem] flex-col gap-8">
      {/* 1. Compact header */}
      <header className="flex flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {space.is_demo ? (
            <>
              <FlaskConical className="size-3.5 text-brand-gold-foreground" aria-hidden /> Demo sandbox · synthetic data
            </>
          ) : space.type === "course" ? (
            "Course project Space"
          ) : (
            "Hackathon Space"
          )}
          {space.status !== "open" && <span className="capitalize">· {space.status}</span>}
        </p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{space.title}</h1>
        <p className="text-sm text-muted-foreground" data-testid="participant-count">
          {stats}
        </p>
      </header>

      {/* 2. What you can do here */}
      <nav aria-label="What you can do in this Space" className="flex flex-col gap-3.5">
        <ActionCard
          id="smart"
          href={`${base}/smart`}
          icon={Sparkles}
          title="Smart Team Formation"
          body="Get a complete team recommendation based on skills, goals, and availability."
          cta="Build My Team"
          featured
        />
        <ActionCard
          id="find"
          href={`${base}/find`}
          icon={Search}
          title="Find a Team"
          body="Browse recruiting teams and request to join."
          cta="Find a Team"
        />
        <ActionCard
          id="grow"
          href={`${base}/grow`}
          icon={UserPlus}
          title="Grow My Team"
          body="Find teammates who fill the missing roles in your team."
          cta="Grow My Team"
        />
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-muted-foreground">
          {!myTeam && space.status === "open" && (
            <Link href={`${base}/teams/new`} className="font-medium text-primary underline-offset-4 hover:underline">
              Create a team
            </Link>
          )}
          <Link href={`${base}/teams`} className="underline-offset-4 hover:text-foreground hover:underline">
            All teams
          </Link>
        </p>
      </nav>

      {/* 3. Your team (only if you're on one) */}
      {myTeam && (
        <section aria-labelledby="team-heading" className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" data-testid="your-team">
          <div className="min-w-0">
            <h2 id="team-heading" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your team</h2>
            <p className="mt-1 truncate text-base">
              <Link href={`${base}/teams/${myTeam.id}`} className="font-semibold underline-offset-4 hover:underline">
                {myTeam.name}
              </Link>
              <span className="text-muted-foreground">
                {" "}· {STATUS_LABEL[myTeam.status] ?? myTeam.status} · {plural(myTeam.members, "member")}
              </span>
            </p>
          </div>
          {myTeam.status === "active" ? (
            <Link href={`${base}/teams/${myTeam.id}/workspace`} className={cn(buttonVariants(), "w-full sm:w-auto")}>
              <MessagesSquare data-icon="inline-start" aria-hidden /> Open Workspace
            </Link>
          ) : (
            <Link href={`${base}/teams/${myTeam.id}`} className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}>
              View team <ArrowRight data-icon="inline-end" aria-hidden />
            </Link>
          )}
        </section>
      )}

      {/* 4. Your participation, compact */}
      <section aria-labelledby="mine-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="mine-heading" className="text-sm font-medium">Your preferences</h2>
          <Link href={`${base}/setup`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <Settings2 data-icon="inline-start" aria-hidden /> {part.setup_completed ? "Edit preferences" : "Set preferences"}
          </Link>
        </div>
        {!part.setup_completed && (
          <p className="rounded-md bg-brand-gold/10 px-3 py-2 text-xs">You haven&apos;t set your preferences for this Space yet.</p>
        )}
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3" data-testid="participation-summary">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Goal</dt>
            <dd className="truncate">{goalLabel(space.type, part.goal) ?? "Not set"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Roles</dt>
            <dd className="[overflow-wrap:anywhere]">{part.desired_roles.length ? part.desired_roles.map(roleLabel).join(", ") : "Not set"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Looking for a team</dt>
            <dd>{part.looking_for_team ? "Yes" : "No"}</dd>
          </div>
        </dl>
        {profile && !profile.onboarded && (
          <Link href="/profile?welcome=1" className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline">
            <UserRound className="size-4" aria-hidden /> Complete your profile so teammates know what you bring
          </Link>
        )}
      </section>

      {/* 5. Secondary details, collapsed by default (Share opens when you're the only one here). */}
      <div className="flex flex-col gap-3">
        <Disclosure title="Event details" icon={Info} testId="event-details">
          <SpaceFacts space={space} bare />
          <p className="mt-3 text-xs text-muted-foreground">
            Community-created: created by a student, not verified by the organizer or university.
            {space.team_size_source === "app_default" ? " Team size unverified: an app default, not a confirmed rule." : ""}
            {space.requires_code ? " Invite code required to join." : ""}
          </p>
        </Disclosure>
        <Disclosure title="Share this Space" icon={Share2} testId="share-space" open={alone}>
          {alone && (
            <p className="mb-3 text-sm">
              Matching only uses people who have joined this Space. Share the link so classmates can join.
            </p>
          )}
          <InviteLinkCard spaceId={space.id} bare />
        </Disclosure>
      </div>
    </div>
  );
}
