import Link from "next/link";
import { GraduationCap, Search, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function SpacesPage() {
  const { supabase, user } = await getCurrentUser();
  const { data: memberships, error } = await supabase
    .from("participations")
    .select("space:matching_spaces(id, slug, title, type, status, visibility)")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const spaces = (memberships ?? []).map((m) => m.space).filter((s) => s !== null);

  return (
    <>
      <PageHeader
        title="Find your hackathon or course project"
        description="Each Matching Space is one hackathon edition or one course assignment. Matching never crosses Spaces."
      />
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">My Spaces</h2>
      {error ? (
        <p role="alert" className="text-sm text-destructive">Could not load your Spaces. Refresh to try again.</p>
      ) : spaces.length === 0 ? (
        <EmptyState
          icon={Search}
          title="You haven't joined a Space yet"
          description="Searching for and creating Spaces is the next step being built. Once it's live you'll be able to search, join, or create the Space for your event or class."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {spaces.map((s) => (
            <li key={s.id}>
              <Link
                href={`/s/${s.slug}/discover`}
                className="flex items-start gap-3 rounded-xl border bg-card p-4 hover:bg-muted"
              >
                {s.type === "course" ? (
                  <GraduationCap className="mt-0.5 size-4 text-primary" aria-hidden />
                ) : (
                  <Trophy className="mt-0.5 size-4 text-primary" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline">Community-created</Badge>
                    <Badge variant="secondary">{s.status}</Badge>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
