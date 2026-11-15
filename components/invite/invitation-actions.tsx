"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Send, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiFetch } from "@/lib/api/client";

type RespondResult = { outcome: "accepted" | "declined"; team_id: string; team_status: string; activated?: boolean };

/**
 * Accept / decline. Used by invitees (invitations) and by recruiters (join
 * requests). The database decides who may answer.
 */
export function RespondActions({
  invitationId,
  kind,
  teamName,
  personName,
  teamHref,
}: {
  invitationId: string;
  kind: "invite" | "request";
  teamName: string;
  personName?: string | null;
  teamHref?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [ownDraft, setOwnDraft] = useState<string | null>(null);
  const who = personName ?? "this student";

  async function respond(accept: boolean, leaveSoloDraft = false) {
    setBusy(accept ? "accept" : "decline");
    try {
      const r = await apiFetch<RespondResult>(`/api/invitations/${invitationId}/respond`, {
        method: "POST",
        json: { accept, leave_solo_draft: leaveSoloDraft },
      });
      setOwnDraft(null);
      if (r.outcome === "accepted") {
        const active = r.team_status === "active";
        toast.success(
          kind === "invite"
            ? `You joined ${teamName}.${active ? " The team is now active." : ""}`
            : `${who} joined ${teamName}.${active ? " The team is now active." : ""}`,
        );
        if (kind === "invite" && teamHref) {
          router.push(teamHref);
          return;
        }
      } else {
        toast.success(kind === "invite" ? `You declined ${teamName}'s invitation.` : `You declined ${who}'s request.`);
      }
      router.refresh();
    } catch (err) {
      const e = err as ApiClientError;
      if (e.code === "OWN_DRAFT_TEAM") {
        setOwnDraft(e.message);
      } else {
        toast.error(e.message);
        if (["INVITE_EXPIRED", "INVITE_NO_LONGER_VALID", "TEAM_FULL", "CONFLICT_OTHER_TEAM"].includes(e.code)) router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  const label = kind === "invite" ? teamName : who;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => respond(true)} disabled={busy !== null} aria-label={`Accept ${kind === "invite" ? "invitation from" : "request from"} ${label}`}>
          {busy === "accept" ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Check data-icon="inline-start" aria-hidden />}
          Accept
        </Button>
        <Button size="sm" variant="outline" onClick={() => respond(false)} disabled={busy !== null} aria-label={`Decline ${kind === "invite" ? "invitation from" : "request from"} ${label}`}>
          {busy === "decline" ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <X data-icon="inline-start" aria-hidden />}
          Decline
        </Button>
      </div>
      <Dialog open={ownDraft !== null} onOpenChange={(o) => !o && setOwnDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Join {teamName} instead?</DialogTitle>
            <DialogDescription>{ownDraft}</DialogDescription>
          </DialogHeader>
          <p className="text-sm">You can only be on one team per Space.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOwnDraft(null)}>Keep my team</Button>
            <Button onClick={() => respond(true, true)} disabled={busy !== null}>
              {busy === "accept" && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
              Close my team and join
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Cancel a pending invitation (team side) or withdraw a request (student side). */
export function CancelInvitationButton({ invitationId, label, ariaLabel }: { invitationId: string; label: string; ariaLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      aria-label={ariaLabel}
      onClick={async () => {
        setBusy(true);
        try {
          await apiFetch(`/api/invitations/${invitationId}/cancel`, { method: "POST", json: {} });
          toast.success("Done. Nothing else changed.");
          router.refresh();
        } catch (err) {
          toast.error((err as ApiClientError).message);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <X data-icon="inline-start" aria-hidden />}
      {label}
    </Button>
  );
}

/** Find a Team → ask to join, with an optional short note. */
export function RequestToJoinButton({ teamId, teamName, size = "sm" }: { teamId: string; teamName: string; size?: "sm" | "default" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)} aria-label={`Request to join ${teamName}`}>
        <UserPlus data-icon="inline-start" aria-hidden /> Request to join
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request to join {teamName}</DialogTitle>
            <DialogDescription>
              The team&apos;s owner and recruiters will see your profile for this Space and decide. You join only if they accept.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`req-msg-${teamId}`} className="text-sm font-medium">
              Note to the team <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea id={`req-msg-${teamId}`} maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What you'd bring, and what you want to build." />
            <p className="text-right text-xs text-muted-foreground">{message.length}/280</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await apiFetch(`/api/teams/${teamId}/requests`, { method: "POST", json: { message } });
                  toast.success(`Request sent to ${teamName}. You'll see their answer under Invitations.`);
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  toast.error((err as ApiClientError).message);
                  router.refresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Send data-icon="inline-start" aria-hidden />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Grow My Team → invite one recommended candidate (explicit action). */
export function InviteCandidateButton({ teamId, userId, name }: { teamId: string; userId: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      disabled={busy}
      aria-label={`Invite ${name}`}
      onClick={async () => {
        setBusy(true);
        try {
          await apiFetch(`/api/teams/${teamId}/invitations`, { method: "POST", json: { user_ids: [userId] } });
          toast.success(`Invitation sent to ${name}. They decide whether to join.`);
          router.refresh();
        } catch (err) {
          toast.error((err as ApiClientError).message);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Send data-icon="inline-start" aria-hidden />}
      Invite
    </Button>
  );
}

/** Owner-only early activation, with an explicit list of who gets cancelled. */
export function FinalizeTeamButton({ teamId, accepted, pendingNames }: { teamId: string; accepted: number; pendingNames: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Check data-icon="inline-start" aria-hidden /> Finalize team with {accepted} members
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalize with {accepted} members?</DialogTitle>
            <DialogDescription>The team becomes Active now, with the members who already accepted.</DialogDescription>
          </DialogHeader>
          {pendingNames.length > 0 ? (
            <div className="text-sm">
              <p>These pending invitations will be cancelled:</p>
              <ul className="mt-1 list-disc pl-5">
                {pendingNames.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm">No invitations are pending.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Not yet</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await apiFetch(`/api/teams/${teamId}/finalize`, { method: "POST", json: {} });
                  toast.success("Team finalized. It's now active.");
                  setOpen(false);
                  router.refresh();
                } catch (err) {
                  toast.error((err as ApiClientError).message);
                  router.refresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
              Finalize team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
