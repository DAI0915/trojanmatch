import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { ProfileForm, type ProfileFormValue } from "@/components/profile/profile-form";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const sp = await searchParams;
  const { supabase, user } = await getCurrentUser();
  const { data: p } = await supabase
    .from("profiles")
    .select("display_name, university, bio, skills, roles, interests, experience, working_style, availability, timezone, onboarded, is_synthetic")
    .eq("id", user!.id)
    .maybeSingle();

  if (!p) {
    return <EmptyState icon={UserRound} title="Profile not found" description="Sign out and back in to retry." />;
  }

  const initial: ProfileFormValue = {
    display_name: p.display_name,
    university: p.university ?? "",
    bio: p.bio ?? "",
    skills: p.skills,
    roles: p.roles,
    interests: p.interests,
    experience: p.experience,
    working_style: (p.working_style ?? {}) as ProfileFormValue["working_style"],
    availability: p.availability,
    timezone: p.timezone,
  };

  return (
    <>
      <PageHeader
        title="Your profile"
        description="One global profile, reused across Spaces. Other students see it only in Spaces where you turn visibility on."
      />
      {p.is_synthetic && (
        <Badge variant="outline" className="mb-4">
          Synthetic demo user
        </Badge>
      )}
      <ProfileForm initial={initial} onboarding={sp.welcome === "1" || !p.onboarded} />
    </>
  );
}
