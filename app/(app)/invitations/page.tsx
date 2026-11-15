import Link from "next/link";
import { Clock, Inbox, UserRound, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { CancelInvitationButton, RespondActions } from "@/components/invite/invitation-actions";
import { REASON_LABEL, effectiveStatus, loadInbox, type InvitationView } from "@/lib/invitations";
import { expiresIn, timeAgo } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function InvitationsPage() {
  const { user } = await getCurrentUser();
  const inbox = await loadInbox(user!.id);
  const nothing =
    inbox.incoming.length + inbox.myRequests.length + inbox.teamRequests.length + inbox.teamInvites.length + inbox.history.length === 0;

  return (
    <>
      <PageHeader title="Invitations" description="Invites you receive and requests you send. Nothing is sent or accepted without your explicit action." />
      {nothing ? (
        <EmptyState icon={Inbox} title="No pending invitations" description="When a team invites you, or you request to join one, it shows up here." />
      ) : (
        <div className="flex flex-col gap-8">
          <Section id="incoming" title="Invitations for you" count={inbox.incoming.length} empty="No invitations are waiting for you.">
            {inbox.incoming.map((i) => (
              <Card key={i.id} i={i} testId="incoming-invitation">
                <p className="text-sm">
                  <strong>{i.actorName ?? "A team member"}</strong> invited you to join <strong>{i.team.name}</strong>.
                </p>
                <TeamLine i={i} />
                {i.message && <Quote text={i.message} />}
                <RespondActions invitationId={i.id} kind="invite" teamName={i.team.name} teamHref={`/s/${i.team.spaceSlug}/teams/${i.team.id}`} />
              </Card>
            ))}
          </Section>

          {(inbox.teamRequests.length > 0 || inbox.recruiterOf.size > 0) && (
            <Section id="team-requests" title="Requests to join your teams" count={inbox.teamRequests.length} empty="Nobody has asked to join your teams.">
              {inbox.teamRequests.map((i) => (
                <Card key={i.id} i={i} testId="team-request">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm">
                    <UserRound className="size-3.5" aria-hidden />
                    <strong>{i.person.name ?? "A student"}</strong>
                    {i.person.synthetic && <Badge variant="outline" className="h-4 px-1 text-[10px]">Synthetic</Badge>}
                    asked to join <strong>{i.team.name}</strong>.
                  </p>
                  <TeamLine i={i} />
                  {i.message && <Quote text={i.message} />}
                  {inbox.recruiterOf.has(i.team.id) ? (
                    <RespondActions invitationId={i.id} kind="request" teamName={i.team.name} personName={i.person.name} />
                  ) : (
                    <p className="text-xs text-muted-foreground">The team&apos;s owner or a recruiter decides.</p>
                  )}
                </Card>
              ))}
            </Section>
          )}

          <Section id="my-requests" title="Your join requests" count={inbox.myRequests.length} empty="You haven't asked to join any team. Browse Find a Team in a Space.">
            {inbox.myRequests.map((i) => (
              <Card key={i.id} i={i} testId="my-request">
                <p className="text-sm">
                  You asked to join <strong>{i.team.name}</strong>. Waiting for the team to answer.
                </p>
                <TeamLine i={i} />
                <div>
                  <CancelInvitationButton invitationId={i.id} label="Withdraw" ariaLabel={`Withdraw request to ${i.team.name}`} />
                </div>
              </Card>
            ))}
          </Section>

          {inbox.teamInvites.length > 0 && (
            <Section id="sent" title="Sent by your teams" count={inbox.teamInvites.length} empty="">
              {inbox.teamInvites.map((i) => (
                <Card key={i.id} i={i} testId="sent-invitation">
                  <p className="text-sm">
                    <strong>{i.person.name ?? "A student"}</strong> is invited to <strong>{i.team.name}</strong> and hasn&apos;t answered yet.
                  </p>
                  <TeamLine i={i} />
                  {inbox.recruiterOf.has(i.team.id) && (
                    <div>
                      <CancelInvitationButton invitationId={i.id} label="Cancel invitation" ariaLabel={`Cancel invitation to ${i.person.name ?? "student"}`} />
                    </div>
                  )}
                </Card>
              ))}
            </Section>
          )}

          {inbox.history.length > 0 && (
            <section aria-labelledby="history-heading">
              <h2 id="history-heading" className="mb-3 text-lg font-semibold">Recent activity</h2>
              <ul className="flex flex-col divide-y rounded-xl border bg-card px-4" data-testid="inbox-history">
                {inbox.history.map((i) => {
                  const st = effectiveStatus(i);
                  const subject = i.userId === user!.id ? "You" : (i.person.name ?? "A student");
                  return (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" data-testid="history-row">
                      <span className="min-w-0">
                        {subject} · {i.kind === "invite" ? "invitation to" : "request to join"}{" "}
                        <Link href={`/s/${i.team.spaceSlug}/teams/${i.team.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                          {i.team.name}
                        </Link>
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="font-normal capitalize">{st}</Badge>
                        {i.statusReason && REASON_LABEL[i.statusReason] && <span>{REASON_LABEL[i.statusReason]}</span>}
                        <span>{timeAgo(i.respondedAt ?? i.createdAt)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function Section({ id, title, count, empty, children }: { id: string; title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="mb-3 text-lg font-semibold">
        {title} <span className="font-normal text-muted-foreground">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">{children}</ul>
      )}
    </section>
  );
}

function Card({ i, testId, children }: { i: InvitationView; testId: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4" data-testid={testId} data-team={i.team.name}>
      {children}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" aria-hidden /> Sent {timeAgo(i.createdAt)} · expires {expiresIn(i.expiresAt)}
      </p>
    </li>
  );
}

function TeamLine({ i }: { i: InvitationView }) {
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <UsersRound className="size-3.5" aria-hidden />
      <Link href={`/s/${i.team.spaceSlug}/teams/${i.team.id}`} className="text-primary underline-offset-4 hover:underline">
        {i.team.name}
      </Link>
      · {i.team.members} of {i.team.targetSize} accepted · {i.team.spaceTitle}
    </p>
  );
}

function Quote({ text }: { text: string }) {
  return <p className="rounded-md bg-muted px-3 py-2 text-sm [overflow-wrap:anywhere]">“{text}”</p>;
}
