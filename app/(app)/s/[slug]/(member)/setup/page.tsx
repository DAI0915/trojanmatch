import { notFound } from "next/navigation";
import { CheckCircle2, PartyPopper } from "lucide-react";
import { ParticipationForm, type ParticipationValue } from "@/components/participation/participation-form";
import { InviteLinkCard } from "@/components/space/invite-link-card";
import { SpaceHeader } from "@/components/space/space-header";
import { getSpace } from "@/lib/spaces";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function ParticipationSetupPage({ params, searchParams }: PageProps<"/s/[slug]/setup">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const space = await getSpace(slug);
  if (!space) notFound();

  const { supabase, user } = await getCurrentUser();
  const [{ data: part }, { data: profile }] = await Promise.all([
    supabase
      .from("participations")
      .select("goal, goal_note, desired_roles, topics, availability_override, looking_for_team, accept_invites, smart_match_opt_in, visible_to_members, setup_completed, notes")
      .eq("space_id", space.id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase.from("profiles").select("roles, interests, availability, timezone").eq("id", user!.id).maybeSingle(),
  ]);
  if (!part || !profile) notFound();

  const initial: ParticipationValue = {
    goal: part.goal,
    goal_note: part.goal_note ?? "",
    // First-time setup pre-fills from the global profile (still editable, nothing shared until consent).
    desired_roles: part.setup_completed ? part.desired_roles : part.desired_roles.length ? part.desired_roles : profile.roles.slice(0, 4),
    topics: part.setup_completed ? part.topics : part.topics.length ? part.topics : profile.interests.slice(0, 8),
    availability_override: part.availability_override,
    looking_for_team: part.looking_for_team,
    accept_invites: part.accept_invites,
    smart_match_opt_in: part.smart_match_opt_in,
    visible_to_members: part.visible_to_members,
    notes: part.notes ?? "",
  };

  return (
    <>
      <SpaceHeader space={space} />
      {sp.created === "1" && (
        <div className="mb-6 flex flex-col gap-4">
          <div role="status" className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <PartyPopper className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div className="text-sm">
              <p className="font-medium">Space created. You&apos;re its first participant.</p>
              <p className="mt-0.5 text-muted-foreground">
                No team was created, and you have no organizer privileges. Share the link so classmates or fellow
                hackers can join.
              </p>
            </div>
          </div>
          <InviteLinkCard spaceId={space.id} emphasize />
        </div>
      )}
      {sp.joined === "1" && (
        <div role="status" className="mb-6 flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p>
            <span className="font-medium">You joined this Space.</span>{" "}
            <span className="text-muted-foreground">Set your preferences for it below. Nothing is shared until you turn it on.</span>
          </p>
        </div>
      )}
      <h2 className="mb-4 text-lg font-semibold">Your participation in this Space</h2>
      <ParticipationForm
        spaceId={space.id}
        slug={space.slug}
        spaceType={space.type}
        initial={initial}
        profileAvailability={profile.availability}
        profileTimezone={profile.timezone}
        firstTime={!part.setup_completed}
      />
    </>
  );
}
