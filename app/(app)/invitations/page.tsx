import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function InvitationsPage() {
  const { supabase, user } = await getCurrentUser();
  const { count } = await supabase
    .from("invitations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user!.id)
    .eq("status", "pending");

  return (
    <>
      <PageHeader title="Invitations" description="Invites you receive and requests you send. Nothing is sent without your explicit action." />
      {!count ? (
        <EmptyState icon={Inbox} title="No pending invitations" description="When a team invites you, or you request to join one, it shows up here." />
      ) : (
        <p className="text-sm">You have {count} pending invitation(s).</p>
      )}
    </>
  );
}
