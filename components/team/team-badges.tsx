import { CircleDashed, CircleDot, CheckCircle2, Archive, Megaphone, PauseCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TeamStatus } from "@/lib/teams";

const STATUS: Record<TeamStatus, { label: string; icon: typeof CircleDot; hint: string; className: string }> = {
  draft: { label: "Draft", icon: CircleDashed, hint: "Not yet formed. No invitations are pending.", className: "" },
  forming: { label: "Forming", icon: CircleDot, hint: "Invitations sent; waiting for responses.", className: "border-brand-gold/70 bg-brand-gold/10" },
  active: { label: "Active", icon: CheckCircle2, hint: "Formed: members accepted and the Space minimum is met.", className: "border-primary/40 bg-primary/10 text-primary" },
  archived: { label: "Archived", icon: Archive, hint: "No longer recruiting or active.", className: "" },
};

/** Status always shown as icon + text (never color alone). */
export function TeamStatusBadge({ status }: { status: TeamStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <Badge variant="outline" className={`gap-1 font-normal ${s.className}`} title={s.hint}>
      <Icon className="size-3" aria-hidden /> {s.label}
    </Badge>
  );
}

export function RecruitingBadge({ recruiting, open }: { recruiting: boolean; open: number }) {
  if (recruiting && open > 0) {
    return (
      <Badge variant="outline" className="gap-1 font-normal">
        <Megaphone className="size-3" aria-hidden /> Recruiting · {open} open
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
      <PauseCircle className="size-3" aria-hidden /> Not recruiting
    </Badge>
  );
}
