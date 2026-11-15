import Link from "next/link";
import { GraduationCap, Plus, Search, Trophy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { inputClass } from "@/components/forms/field";
import { SpaceCard, type SpaceSummary } from "@/components/space/space-card";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/supabase/server";

type SpaceType = "hackathon" | "course";
const TABS: { type: SpaceType; label: string; icon: typeof Trophy }[] = [
  { type: "hackathon", label: "Hackathons", icon: Trophy },
  { type: "course", label: "Course projects", icon: GraduationCap },
];

export default async function SpacesPage({ searchParams }: PageProps<"/spaces">) {
  const sp = await searchParams;
  const type: SpaceType = sp.type === "course" ? "course" : "hackathon";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";

  const { supabase, user } = await getCurrentUser();
  const [{ data: rows, error }, { data: profile }] = await Promise.all([
    supabase.rpc("search_spaces", { p_type: type, p_query: q || undefined, p_limit: 48 }),
    supabase.from("profiles").select("onboarded").eq("id", user!.id).maybeSingle(),
  ]);
  const spaces = (rows ?? []) as unknown as SpaceSummary[];
  const mine = spaces.filter((s) => s.is_member);
  const others = spaces.filter((s) => !s.is_member);
  const createHref = `/spaces/new?type=${type}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader
        title="Find your hackathon or course project"
        description="Each Matching Space is one hackathon edition or one course assignment. Search and matching never cross Spaces."
      />

      {profile && !profile.onboarded && (
        <div className="mb-6 flex flex-col gap-2 rounded-lg border border-brand-gold/60 bg-brand-gold/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span>Complete your profile so teammates know what you bring.</span>
          <Link href="/profile?welcome=1" className={buttonVariants({ size: "sm", variant: "outline" })}>
            Complete profile
          </Link>
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="Space type">
        {TABS.map(({ type: t, label, icon: Icon }) => (
          <Link
            key={t}
            role="tab"
            aria-selected={t === type}
            href={`/spaces?type=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
              t === type ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </Link>
        ))}
      </div>

      <form action="/spaces" method="get" role="search" className="mb-8 flex gap-2">
        <input type="hidden" name="type" value={type} />
        <label htmlFor="space-search" className="sr-only">
          Search Spaces
        </label>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id="space-search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder={type === "hackathon" ? "e.g. TreeHacks 2027" : "e.g. CSCI 567 or Final Project"}
            className={cn(inputClass, "pl-9")}
          />
        </div>
        <button type="submit" className={buttonVariants()}>
          Search
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load Spaces. Refresh to try again.
        </p>
      ) : q ? (
        <section aria-labelledby="results-heading">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 id="results-heading" className="text-sm font-medium text-muted-foreground">
              {spaces.length === 0 ? "No matching spaces found" : `${spaces.length} result${spaces.length === 1 ? "" : "s"} for “${q}”`}
            </h2>
          </div>
          {spaces.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matching spaces found"
              description={`Nobody has created a Space for “${q}” yet. Create it, then share the link with teammates.`}
            >
              <Link href={createHref} className={buttonVariants()}>
                <Plus data-icon="inline-start" aria-hidden /> Create New Space
              </Link>
            </EmptyState>
          ) : (
            <>
              <ul className="grid gap-3 sm:grid-cols-2">
                {spaces.map((s) => (
                  <li key={s.id}>
                    <SpaceCard space={s} />
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-sm text-muted-foreground">
                Can&apos;t find it?{" "}
                <Link href={createHref} className="font-medium text-primary underline-offset-4 hover:underline">
                  Create New Space
                </Link>
              </p>
            </>
          )}
        </section>
      ) : (
        <div className="flex flex-col gap-10">
          <section aria-labelledby="mine-heading">
            <h2 id="mine-heading" className="mb-3 text-sm font-medium text-muted-foreground">
              My {type === "hackathon" ? "hackathon" : "course"} Spaces
            </h2>
            {mine.length === 0 ? (
              <EmptyState
                icon={type === "hackathon" ? Trophy : GraduationCap}
                title="You haven't joined one yet"
                description={
                  type === "hackathon"
                    ? "Search for your hackathon above, or create its Space if nobody has yet."
                    : "Course Spaces are invite-only by default. Open the link a classmate shared, or create the Space for your assignment."
                }
              >
                <Link href={createHref} className={buttonVariants({ variant: "outline" })}>
                  <Plus data-icon="inline-start" aria-hidden /> Create New Space
                </Link>
              </EmptyState>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {mine.map((s) => (
                  <li key={s.id}>
                    <SpaceCard space={s} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(type === "hackathon" || others.length > 0) && (
            <section aria-labelledby="public-heading">
              <h2 id="public-heading" className="mb-3 text-sm font-medium text-muted-foreground">
                Public {type === "hackathon" ? "hackathon" : "course"} Spaces
              </h2>
              {others.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No other public {type === "hackathon" ? "hackathon" : "course"} Spaces yet.
                </p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {others.map((s) => (
                    <li key={s.id}>
                      <SpaceCard space={s} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
