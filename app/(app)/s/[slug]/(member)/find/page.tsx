import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Crown, Info, Search, SlidersHorizontal, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClass } from "@/components/forms/field";
import { CancelInvitationButton, RequestToJoinButton } from "@/components/invite/invitation-actions";
import { SpaceHeader } from "@/components/space/space-header";
import { ApiError } from "@/lib/api/errors";
import { expiresIn } from "@/lib/format";
import { findTeams, sortTeams, type FindFilters, type FindSort, type FoundTeam } from "@/lib/matching/find";
import { getSpace } from "@/lib/spaces";
import { getCurrentUser } from "@/lib/supabase/server";
import { GOALS, INTERESTS, ROLES, SKILLS, roleLabel } from "@/lib/taxonomy";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ROLE_IDS = new Set(ROLES.map((r) => r.id));
const SKILL_IDS = new Set(SKILLS.map((s) => s.id));
const TOPIC_IDS = new Set(INTERESTS.map((i) => i.id));

export default async function FindTeamPage({ params, searchParams }: PageProps<"/s/[slug]/find">) {
  const { slug } = await params;
  const sp = await searchParams;
  const space = await getSpace(slug);
  if (!space) notFound();
  const { supabase } = await getCurrentUser();

  // Only known taxonomy values reach the database; everything else is dropped.
  const q = one(sp.q).trim().slice(0, 60);
  const role = ROLE_IDS.has(one(sp.role)) ? one(sp.role) : "";
  const skill = SKILL_IDS.has(one(sp.skill)) ? one(sp.skill) : "";
  const topic = TOPIC_IDS.has(one(sp.topic)) ? one(sp.topic) : "";
  const goal = GOALS[space.type].some((g) => g.id === one(sp.goal)) ? one(sp.goal) : "";
  const hoursRaw = Number(one(sp.hours));
  const hours = Number.isInteger(hoursRaw) && hoursRaw > 0 && hoursRaw <= 40 ? hoursRaw : null;
  const sort: FindSort = one(sp.sort) === "newest" ? "newest" : one(sp.sort) === "open" ? "open" : "recommended";
  const filters: FindFilters = {
    ...(q ? { q } : {}),
    ...(role ? { roles: [role] } : {}),
    ...(skill ? { skills: [skill] } : {}),
    ...(topic ? { topics: [topic] } : {}),
    ...(goal ? { goal } : {}),
    ...(hours ? { min_shared_hours: hours } : {}),
  };
  const filtered = Object.keys(filters).length > 0;

  let result: Awaited<ReturnType<typeof findTeams>> | null = null;
  let blocked: string | null = null;
  try {
    result = await findTeams(supabase, space.id, filters);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    blocked = e.message;
  }

  const spaceOpen = space.status === "open" && (!space.team_deadline_at || new Date(space.team_deadline_at) > new Date());
  const teams = result ? sortTeams(result.teams, sort) : [];

  return (
    <>
      <SpaceHeader space={space} />
      <div className="mb-5">
        <h2 className="text-xl font-semibold">Find a Team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Recruiting teams in this Space with a free seat, ranked by how well the team would work <em>with you</em>. You join only if the team accepts your request.
        </p>
      </div>

      <form method="get" className="mb-6 rounded-xl border bg-card p-4" role="search" aria-label="Filter teams">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="f-q" className="text-sm font-medium">Search</label>
            <input id="f-q" name="q" defaultValue={q} maxLength={60} className={inputClass} placeholder="Team name or description" />
          </div>
          <Select id="f-role" name="role" label="Looking for role" value={role} options={ROLES.filter((r) => r.id !== "flexible")} />
          <Select id="f-skill" name="skill" label="Wants skill" value={skill} options={SKILLS} />
          <Select id="f-topic" name="topic" label="Interest" value={topic} options={INTERESTS} />
          <Select id="f-goal" name="goal" label="Goal" value={goal} options={GOALS[space.type]} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-hours" className="text-sm font-medium">Shared hours/week with me</label>
            <input id="f-hours" name="hours" type="number" min={1} max={40} inputMode="numeric" defaultValue={hours ?? ""} className={inputClass} placeholder="Any" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-sort" className="text-sm font-medium">Sort</label>
            <select id="f-sort" name="sort" defaultValue={sort} className={inputClass}>
              <option value="recommended">Recommended for you</option>
              <option value="open">Most open positions</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="submit" className={buttonVariants()}>
            <Search data-icon="inline-start" aria-hidden /> Apply filters
          </button>
          {filtered && (
            <Link href={`/s/${slug}/find`} className={buttonVariants({ variant: "outline" })}>
              Clear filters
            </Link>
          )}
        </div>
      </form>

      {blocked || !result ? (
        <section role="status" className="rounded-xl border border-brand-gold/60 bg-brand-gold/10 p-5">
          <h3 className="font-medium">Find a Team isn&apos;t available right now</h3>
          <p className="mt-1 text-sm">{blocked}</p>
        </section>
      ) : (
        <>
          {result.onTeam && (
            <p role="status" className="mb-4 flex gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              You&apos;re already on a team in this Space, so you can browse but not request to join (one team per Space).
            </p>
          )}
          <p className="mb-3 text-sm text-muted-foreground" data-testid="find-count">
            {teams.length} of {result.totalRecruiting} recruiting team{result.totalRecruiting === 1 ? "" : "s"}
            {filtered ? " match your filters" : ""} · {sort === "recommended" ? "Recommended for you" : sort === "open" ? "Most open positions" : "Newest"}
          </p>
          {teams.length === 0 ? (
            <EmptyState
              icon={filtered ? SlidersHorizontal : Users}
              title={filtered ? "No teams match these filters" : "No teams are recruiting yet"}
              description={
                filtered
                  ? "Try removing a filter, or lower the shared-hours minimum."
                  : "Start your own team, or let Smart Team Formation propose one around you."
              }
            >
              {filtered ? (
                <Link href={`/s/${slug}/find`} className={buttonVariants({ variant: "outline" })}>Clear filters</Link>
              ) : (
                !result.onTeam && (
                  <>
                    <Link href={`/s/${slug}/teams/new`} className={buttonVariants()}>Create a team</Link>
                    <Link href={`/s/${slug}/smart`} className={buttonVariants({ variant: "outline" })}>Smart Team Formation</Link>
                  </>
                )
              )}
            </EmptyState>
          ) : (
            <ol className="grid gap-3 md:grid-cols-2" aria-label="Recruiting teams">
              {teams.map((t, i) => (
                <TeamResult key={t.id} t={t} slug={slug} rank={sort === "recommended" ? i + 1 : null} canRequest={!result!.onTeam && spaceOpen} />
              ))}
            </ol>
          )}
        </>
      )}
    </>
  );
}

function Select({ id, name, label, value, options }: { id: string; name: string; label: string; value: string; options: readonly { id: string; label: string }[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select id={id} name={name} defaultValue={value} className={inputClass}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function TeamResult({ t, slug, rank, canRequest }: { t: FoundTeam; slug: string; rank: number | null; canRequest: boolean }) {
  const must = t.requirements.must_roles ?? [];
  const preferred = t.requirements.preferred_roles ?? [];
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4" data-testid="find-team" data-team={t.name}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {rank !== null && rank <= 3 && t.fit && <p className="text-xs font-medium text-primary">#{rank} recommended for you</p>}
          <Link href={`/s/${slug}/teams/${t.id}`} className="font-medium underline-offset-4 hover:underline [overflow-wrap:anywhere]">
            {t.name}
          </Link>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
          <Users className="size-3.5" aria-hidden /> {t.members}/{t.targetSize}
          <span className="sr-only"> members</span>
        </span>
      </div>
      {t.description && <p className="line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
      <p className="text-xs" data-testid="find-open">
        {t.openPositions} free seat{t.openPositions === 1 ? "" : "s"}
        {must.length > 0 && <> · <span className="text-muted-foreground">Needs</span> {must.map(roleLabel).join(", ")}</>}
        {preferred.length > 0 && <> · <span className="text-muted-foreground">Nice to have</span> {preferred.map(roleLabel).join(", ")}</>}
      </p>

      {t.fit ? (
        <div className="rounded-lg bg-muted/60 p-3 text-sm" data-testid="find-fit">
          <p className="font-medium">
            Fit with you: {t.fit.band} <span className="font-mono text-xs text-muted-foreground">({t.fit.score.toFixed(2)})</span>
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {t.fit.fillsRoles.map((f) => (
              <Badge key={f.role} variant="outline" className="border-primary/40 bg-primary/10 font-normal text-primary">
                You&apos;d fill {f.role}
                {f.must ? " (required)" : ""}
              </Badge>
            ))}
            {t.fit.addsSkills.map((s) => (
              <Badge key={s} variant="outline" className="font-normal">You add {s}</Badge>
            ))}
            {t.sharedHours !== null && (
              <Badge variant="outline" className="font-normal text-muted-foreground">{t.sharedHours} h/week shared</Badge>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No fit score: this team&apos;s members haven&apos;t shared their profiles.</p>
      )}

      {t.people.length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={`${t.name} members`}>
          {t.people.map((p) => (
            <li key={p.id} className="flex items-center gap-1">
              {p.owner && <Crown className="size-3" aria-label="Owner" />}
              <span className="text-foreground">{p.name}</span>
              {p.roles[0] && <span>· {p.roles[0]}</span>}
              {p.synthetic && <Badge variant="outline" className="h-4 px-1 text-[10px]">Synthetic</Badge>}
            </li>
          ))}
          {t.hiddenMembers > 0 && <li>+{t.hiddenMembers} member{t.hiddenMembers === 1 ? "" : "s"} with a private profile</li>}
        </ul>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {t.myRequest ? (
          <>
            <Badge variant="outline" className="gap-1 font-normal" data-testid="request-pending">
              <Clock className="size-3" aria-hidden /> Request pending · expires {expiresIn(t.myRequest.expires_at)}
            </Badge>
            <CancelInvitationButton invitationId={t.myRequest.id} label="Withdraw" ariaLabel={`Withdraw request to ${t.name}`} />
          </>
        ) : t.myInvite ? (
          <Link href="/invitations" className={buttonVariants({ size: "sm" })}>They invited you · respond</Link>
        ) : (
          canRequest && <RequestToJoinButton teamId={t.id} teamName={t.name} />
        )}
        <Link href={`/s/${slug}/teams/${t.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>View team</Link>
      </div>
    </li>
  );
}
