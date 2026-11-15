import { AlertTriangle, Lock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Every student-created Space is Community-created; "Verified" is never shown in the MVP. */
export function CommunityBadge() {
  return (
    <Badge variant="outline" className="gap-1 font-normal" title="Created by a student. Not verified by the organizer or university.">
      <Users className="size-3" aria-hidden /> Community-created
    </Badge>
  );
}

export function InviteOnlyBadge() {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <Lock className="size-3" aria-hidden /> Invite code required
    </Badge>
  );
}

export function UnverifiedSizeBadge() {
  return (
    <Badge variant="outline" className="gap-1 border-brand-gold/70 bg-brand-gold/10 font-normal text-brand-gold-foreground" title="Team size is an app default, not a confirmed rule.">
      <AlertTriangle className="size-3" aria-hidden /> Team size unverified
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "open") return null;
  return (
    <Badge variant="secondary" className="font-normal capitalize">
      {status}
    </Badge>
  );
}
