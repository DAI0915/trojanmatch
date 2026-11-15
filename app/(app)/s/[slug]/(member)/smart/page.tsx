import Link from "next/link";
import { notFound } from "next/navigation";
import { Info, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { SmartFormation } from "@/components/match/smart-formation";
import { SpaceHeader } from "@/components/space/space-header";
import { ApiError } from "@/lib/api/errors";
import { PRESETS, defaultPreset } from "@/lib/matching/engine";
import { loadPool, type Pool } from "@/lib/matching/service";
import { getSpace } from "@/lib/spaces";
import { getCurrentUser } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/taxonomy";
import { teamsInSpace } from "@/lib/teams";

export default async function SmartTeamFormationPage({ params }: PageProps<"/s/[slug]/smart">) {
  const { slug } = await params;
  const space = await getSpace(slug);
  if (!space) notFound();
  const { supabase, user } = await getCurrentUser();
  const { myTeam } = await teamsInSpace(space.id, user!.id);

  let pool: Pool | null = null;
  let blocked: string | null = null;
  if (myTeam && !myTeam.canRecruit) {
    blocked = `You're a member of “${myTeam.name}”. Only its owner or recruiters can use matching to fill its open positions.`;
  } else {
    try {
      // PostgreSQL decides who is eligible (Space, sandbox, consent, team membership).
      pool = await loadPool(supabase, space.id, myTeam?.id);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      blocked = e.message;
    }
  }

  return (
    <>
      <SpaceHeader space={space} />
      {blocked || !pool ? (
        <section role="status" className="rounded-xl border border-brand-gold/60 bg-brand-gold/10 p-5">
          <h2 className="font-medium">Smart Team Formation isn&apos;t available here right now</h2>
          <p className="mt-1 text-sm">{blocked}</p>
          <Link href={`/s/${slug}/teams`} className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3`}>
            Teams in this Space
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="rounded-xl border bg-card p-4 sm:p-5" aria-labelledby="pool-heading">
            <h2 id="pool-heading" className="flex items-center gap-2 font-medium">
              <Users className="size-4 text-primary" aria-hidden /> Who can be matched
            </h2>
            <p className="mt-1 text-sm" data-testid="pool-summary">
              <strong>{pool.funnel.eligible}</strong> of {pool.funnel.others} other participant{pool.funnel.others === 1 ? "" : "s"} can be suggested
              {pool.funnel.on_a_team > 0 ? ` · ${pool.funnel.on_a_team} already on a team` : ""}.
            </p>
            <p className="mt-1 flex gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Only students in this Space who turned on profile visibility, invitations and AI suggestions, are looking for a team, and aren&apos;t on one yet. Nobody from other Spaces is ever included.
            </p>
            {pool.candidates.length > 0 && (
              <details className="mt-3" data-testid="pool-list">
                <summary className="cursor-pointer text-sm font-medium text-primary">View eligible participants ({pool.candidates.length})</summary>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[...pool.candidates]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{c.roles.map(roleLabel).join(", ") || "Role not set"}</span>
                        </span>
                        {c.synthetic && <Badge variant="outline" className="shrink-0 font-normal">Synthetic</Badge>}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </section>
          <SmartFormation
            spaceId={space.id}
            minSize={space.min_team_size}
            maxSize={space.max_team_size}
            presets={Object.entries(PRESETS).map(([key, p]) => ({ key, label: p.label }))}
            defaultPreset={defaultPreset(space.type)}
            team={pool.team ? { id: pool.team.id, name: pool.team.name, members: pool.team.members.length, targetSize: pool.team.target_size } : null}
          />
        </div>
      )}
    </>
  );
}
