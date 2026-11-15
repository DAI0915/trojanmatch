import { UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function MyTeamsPage() {
  const { supabase, user } = await getCurrentUser();
  const { data: rows } = await supabase
    .from("team_members")
    .select("role, team:teams(id, name, status, target_size, space:matching_spaces(title))")
    .eq("user_id", user!.id)
    .eq("status", "active");
  const teams = (rows ?? []).filter((r) => r.team !== null);

  return (
    <>
      <PageHeader title="My Teams" description="Teams you have joined. A team becomes Active only after members accept." />
      {teams.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No teams yet"
          description="Creating a Space never creates a team. Join a Space first, then find, grow or form a team there."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {teams.map(({ role, team }) => (
            <li key={team!.id} className="flex items-center justify-between rounded-xl border bg-card p-4">
              <div>
                <p className="font-medium">{team!.name}</p>
                <p className="text-sm text-muted-foreground">{team!.space?.title}</p>
              </div>
              <div className="flex gap-1">
                <Badge variant="secondary">{team!.status}</Badge>
                {role === "owner" && <Badge variant="outline">Owner</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
