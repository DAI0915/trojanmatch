import Link from "next/link";
import { CheckCircle2, CircleDashed, CircleDot, Clock, Sparkles, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { REASON_LABEL, effectiveStatus, type InvitationView } from "@/lib/invitations";
import { expiresIn, timeAgo } from "@/lib/format";
import type { TeamStatus } from "@/lib/teams";
import { cn } from "@/lib/utils";
import { CancelInvitationButton, RespondActions } from "./invitation-actions";

const STEPS: { key: TeamStatus; label: string; icon: typeof CircleDot }[] = [
  { key: "draft", label: "Draft", icon: CircleDashed },
  { key: "forming", label: "Forming", icon: CircleDot },
  { key: "active", label: "Active", icon: CheckCircle2 },
];

/** Draft → Forming → Active, with the rule that moves the team forward. */
export function StatusTimeline({
  status,
  minSize,
  accepted,
  pending,
  activationMode,
}: {
  status: TeamStatus;
  minSize: number;
  accepted: number;
  pending: number;
  activationMode: "auto" | "finalized" | null;
}) {
  const idx = STEPS.findIndex((s) => s.key === status);
  const need = Math.max(minSize, 2);
  let hint: string;
  if (status === "active") {
    hint = activationMode === "finalized" ? "Finalized by the owner." : "Activated automatically: enough members accepted and no invitation was left pending.";
  } else if (accepted < need) {
    hint = `Becomes Active when at least ${need} members have accepted (now ${accepted}) and no invitation is pending${pending ? ` (${pending} pending)` : ""}.`;
  } else {
    hint = `Minimum met (${accepted}/${need}). Becomes Active automatically once the ${pending} pending invitation${pending === 1 ? " is" : "s are"} answered, or the owner can finalize now.`;
  }
  return (
    <section aria-labelledby="timeline-heading" className="rounded-xl border bg-card p-4 sm:p-5" data-testid="status-timeline">
      <h2 id="timeline-heading" className="sr-only">Team status</h2>
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = idx >= i;
          return (
            <li key={s.key} className="flex flex-1 items-center gap-2" aria-current={s.key === status ? "step" : undefined}>
              <span className={cn("flex items-center gap-1.5 text-sm", done ? "font-medium text-primary" : "text-muted-foreground")}>
                <Icon className="size-4" aria-hidden /> {s.label}
              </span>
              {i < STEPS.length - 1 && <span className={cn("h-px flex-1", idx > i ? "bg-primary" : "bg-border")} aria-hidden />}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm text-muted-foreground" data-testid="status-hint">{hint}</p>
    </section>
  );
}

function Person({ i }: { i: InvitationView }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <UserRound className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 truncate font-medium">{i.person.name ?? "Student (profile not shared)"}</span>
      {i.person.synthetic && <Badge variant="outline" className="h-4 px-1 text-[10px]">Synthetic</Badge>}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  accepted: "border-primary/40 bg-primary/10 text-primary",
  declined: "",
  expired: "text-muted-foreground",
  cancelled: "text-muted-foreground",
};

/** Invitations & requests of a team, as seen by its accepted members. */
export function TeamInvitations({
  invitations,
  slug,
  canRecruit,
  teamName,
  openSeats,
}: {
  invitations: InvitationView[];
  slug: string;
  canRecruit: boolean;
  teamName: string;
  openSeats: number;
}) {
  const pendingInvites = invitations.filter((i) => i.kind === "invite" && effectiveStatus(i) === "pending");
  const requests = invitations.filter((i) => i.kind === "request" && effectiveStatus(i) === "pending");
  const history = invitations.filter((i) => effectiveStatus(i) !== "pending");
  const declined = history.filter((i) => i.kind === "invite" && i.status === "declined");

  return (
    <div className="flex flex-col gap-6">
      {canRecruit && declined.length > 0 && openSeats > 0 && (
        <section role="status" data-testid="replacement-callout" className="rounded-xl border border-brand-gold/60 bg-brand-gold/10 p-4 sm:p-5">
          <h2 className="font-medium">
            {declined.map((d) => d.person.name ?? "Someone").join(", ")} declined
          </h2>
          <p className="mt-1 text-sm">
            Your accepted members stay on the team. {openSeats} position{openSeats === 1 ? " is" : "s are"} open again: see fresh recommendations and choose who to invite.
          </p>
          <Link href={`/s/${slug}/grow`} className={`${buttonVariants({ size: "sm" })} mt-3`}>
            <Sparkles data-icon="inline-start" aria-hidden /> Find a replacement
          </Link>
        </section>
      )}

      <section aria-labelledby="pending-heading" className="rounded-xl border bg-card p-4 sm:p-5" data-testid="pending-invitations">
        <h2 id="pending-heading" className="font-medium">Pending invitations ({pendingInvites.length})</h2>
        {pendingInvites.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No invitations are waiting for an answer.{canRecruit && openSeats > 0 ? " Use Smart Team Formation or Grow My Team to invite people." : ""}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y">
            {pendingInvites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="pending-invitation">
                <Person i={i} />
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="size-3.5" aria-hidden /> Awaiting reply · expires {expiresIn(i.expiresAt)}
                  {canRecruit && <CancelInvitationButton invitationId={i.id} label="Cancel" ariaLabel={`Cancel invitation to ${i.person.name ?? "student"}`} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="requests-heading" className="rounded-xl border bg-card p-4 sm:p-5" data-testid="join-requests">
        <h2 id="requests-heading" className="font-medium">Join requests ({requests.length})</h2>
        {requests.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Nobody has asked to join yet. Recruiting teams appear in Find a Team.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {requests.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 rounded-lg border p-3" data-testid="join-request">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Person i={i} />
                  <span className="text-xs text-muted-foreground">Asked {timeAgo(i.createdAt)} · expires {expiresIn(i.expiresAt)}</span>
                </div>
                {i.message && <p className="rounded-md bg-muted px-3 py-2 text-sm [overflow-wrap:anywhere]">“{i.message}”</p>}
                {canRecruit ? (
                  <RespondActions invitationId={i.id} kind="request" teamName={teamName} personName={i.person.name} />
                ) : (
                  <p className="text-xs text-muted-foreground">The owner or a recruiter decides.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section aria-labelledby="history-heading" className="rounded-xl border bg-card p-4 sm:p-5" data-testid="invitation-history">
          <h2 id="history-heading" className="font-medium">Responses</h2>
          <ul className="mt-3 flex flex-col divide-y">
            {history.map((i) => {
              const st = effectiveStatus(i);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="history-item">
                  <Person i={i} />
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {i.kind === "request" ? "Request" : "Invitation"}
                    <Badge variant="outline" className={cn("font-normal capitalize", STATUS_STYLE[st])}>{st}</Badge>
                    {i.statusReason && REASON_LABEL[i.statusReason] && <span>({REASON_LABEL[i.statusReason]})</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
