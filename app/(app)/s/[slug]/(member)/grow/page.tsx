import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Plus, Sparkles, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DeltaChip, DimensionBars, FitHeadline, RoleCoverage, ScheduleSummary, SkillChips } from "@/components/match/fit";
import { MemberCard } from "@/components/match/member-card";
import { SpaceHeader } from "@/components/space/space-header";
import { ApiError } from "@/lib/api/errors";
import { loadPool, matchParamsSchema, recommendMembers, type RecommendResponse } from "@/lib/matching/service";
import { getSpace } from "@/lib/spaces";
import { getCurrentUser } from "@/lib/supabase/server";
import { teamsInSpace } from "@/lib/teams";

export default async function GrowMyTeamPage({ params }: PageProps<"/s/[slug]/grow">) {
  const { slug } = await params;
  const space = await getSpace(slug);
  if (!space) notFound();
  const { supabase, user } = await getCurrentUser();
  const { myTeam } = await teamsInSpace(space.id, user!.id);

  if (!myTeam) {
    return (
      <>
        <SpaceHeader space={space} />
        <EmptyState
          icon={UsersRound}
          title="Grow My Team needs a team you recruit for"
          description="Create a team in this Space and say what you're looking for. Then come back here to see your skill gaps and who could fill them."
        >
          <Link href={`/s/${slug}/teams/new`} className={buttonVariants()}>
            <Plus data-icon="inline-start" aria-hidden /> Create a team
          </Link>
          <Link href={`/s/${slug}/smart`} className={buttonVariants({ variant: "outline" })}>
            Or let AI propose a whole team
          </Link>
        </EmptyState>
      </>
    );
  }

  let result: RecommendResponse | null = null;
  let blocked: string | null = null;
  if (!myTeam.canRecruit) {
    blocked = `Only the owner or recruiters of “${myTeam.name}” can see its recommendations.`;
  } else {
    try {
      // The database returns candidates only if you may recruit for this exact team.
      const pool = await loadPool(supabase, space.id, myTeam.id);
      result = recommendMembers(pool, matchParamsSchema.parse({ team_id: myTeam.id }));
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      blocked = e.message;
    }
  }

  if (blocked || !result) {
    return (
      <>
        <SpaceHeader space={space} />
        <section role="status" className="rounded-xl border border-brand-gold/60 bg-brand-gold/10 p-5">
          <h2 className="font-medium">Grow My Team isn&apos;t available right now</h2>
          <p className="mt-1 text-sm">{blocked}</p>
        </section>
      </>
    );
  }

  const { current, missing, candidates } = result;
  const noGaps = missing.must_roles.length + missing.preferred_roles.length + missing.skills.length === 0 && !missing.shared_hours.short;

  return (
    <>
      <SpaceHeader space={space} />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Grow My Team</p>
          <h2 className="text-xl font-semibold">{myTeam.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="grow-capacity">
            {current.members.length} accepted member{current.members.length === 1 ? "" : "s"} · {result.open_slots} open position{result.open_slots === 1 ? "" : "s"} (team size {result.target_size})
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/s/${slug}/teams/${myTeam.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Edit requirements
          </Link>
          {result.open_slots > 0 && (
            <Link href={`/s/${slug}/smart`} className={buttonVariants({ size: "sm" })}>
              <Sparkles data-icon="inline-start" aria-hidden /> Fill all open positions
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="gap-heading" data-testid="gap-analysis">
            <h3 id="gap-heading" className="font-medium">What your team is missing</h3>
            {noGaps ? (
              <p className="mt-2 text-sm text-muted-foreground">Your current members already cover the roles, skills and shared hours you asked for.</p>
            ) : (
              <dl className="mt-3 flex flex-col gap-3 text-sm">
                {missing.must_roles.length > 0 && <Gap label="Required roles not covered" items={missing.must_roles} must />}
                {missing.preferred_roles.length > 0 && <Gap label="Preferred roles not covered" items={missing.preferred_roles} />}
                {missing.skills.length > 0 && <Gap label="Desired skills not covered" items={missing.skills} />}
                {missing.shared_hours.short && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Shared availability</dt>
                    <dd>
                      {missing.shared_hours.have} h/week when everyone is free (you asked for {missing.shared_hours.target})
                    </dd>
                  </div>
                )}
              </dl>
            )}
            <div className="mt-4 border-t pt-4">
              <RoleCoverage roles={current.roles} usingDefault={current.usingDefaultRoles} />
              <div className="mt-3">
                <SkillChips covered={current.skillsCovered} missing={current.skillsMissing} areas={current.skillAreas} />
              </div>
              <div className="mt-3">
                <ScheduleSummary schedule={current.schedule} />
              </div>
            </div>
          </section>

          <section aria-labelledby="rec-heading">
            <h3 id="rec-heading" className="font-medium">Recommended members</h3>
            <p className="mb-3 mt-1 text-sm text-muted-foreground">
              Ranked by how much each student improves your team <em>as a whole</em>, not by how similar they are to you. They are candidates only: nobody is invited or added.
            </p>
            {result.open_slots === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Your team has no open positions. Add open positions on the team page to get recommendations.
              </p>
            ) : candidates.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground" data-testid="grow-empty">
                No candidates yet: {result.funnel.others === 0 ? "nobody else has joined this Space." : "nobody else in this Space is currently eligible (opted in and not on a team)."} Share the Space link and check back.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {candidates.map((c) => (
                  <li key={c.candidate.id} data-testid="grow-candidate">
                    <MemberCard
                      member={c.candidate}
                      actions={
                        <div className="flex w-full flex-col gap-2 border-t pt-3">
                          <p className="flex flex-wrap items-center gap-2 text-sm">
                            Team fit {current.score.toFixed(3)} → {c.score_after.toFixed(3)}
                            <DeltaChip value={c.gain} digits={3} testId="grow-gain" />
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {c.fills_roles.map((f) => (
                              <Badge key={f.role} variant="outline" className="border-primary/40 bg-primary/10 font-normal text-primary">
                                Fills {f.role}
                                {f.level === "must" ? " (required)" : ""}
                              </Badge>
                            ))}
                            {c.adds_skills.map((s) => (
                              <Badge key={s} variant="outline" className="font-normal">Adds {s}</Badge>
                            ))}
                            <Badge variant="outline" className="font-normal text-muted-foreground">{c.shared_hours_after} h/week shared after</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {current.dimensions
                              .filter((d) => Math.abs(c.part_deltas[d.key]) >= 0.005)
                              .map((d) => (
                                <DeltaChip key={d.key} value={c.part_deltas[d.key]} label={`${d.label} `} />
                              ))}
                          </div>
                        </div>
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              <ArrowRight className="size-4 shrink-0" aria-hidden />
              Inviting candidates arrives in the next update. Nothing has been sent.
            </p>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="current-heading">
            <h3 id="current-heading" className="mb-3 font-medium">Your team today</h3>
            <FitHeadline team={current} />
            <div className="mt-4">
              <DimensionBars dimensions={current.dimensions} />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function Gap({ label, items, must }: { label: string; items: string[]; must?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 flex flex-wrap gap-1.5">
        {items.map((i) => (
          <span key={i} className={must ? "rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary" : "rounded-full border px-2.5 py-0.5 text-xs"}>
            {i}
          </span>
        ))}
      </dd>
    </div>
  );
}
