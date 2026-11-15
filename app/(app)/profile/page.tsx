import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const { supabase, user } = await getCurrentUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, university, skills, roles, interests, onboarded, is_synthetic")
    .eq("id", user!.id)
    .maybeSingle();

  if (!profile) {
    return <EmptyState icon={UserRound} title="Profile not found" description="Sign out and back in to retry." />;
  }

  return (
    <>
      <PageHeader title="Profile" description="Your global profile is shared only in Spaces where you turn on visibility." />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {profile.display_name}
            {profile.is_synthetic && <Badge variant="outline">Synthetic demo user</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-muted-foreground">
            Account email: {user!.email} (only visible to you; never shown to other students)
          </p>
          <p>{profile.onboarded ? "Profile complete." : "Profile setup (skills, roles, interests, availability) comes next."}</p>
        </CardContent>
      </Card>
    </>
  );
}
