import { Users } from "lucide-react";
import { SwitchToInviteeButton, type DemoPerson } from "./persona-switcher";

/**
 * Demo only, on a team page with pending invitations: the visitor plays every
 * student, so the obvious next step is to become an invitee and accept.
 */
export function DemoNextStep({ people }: { people: DemoPerson[] }) {
  if (people.length === 0) return null;
  const [first, ...rest] = people;
  return (
    <section
      aria-labelledby="demo-next-heading"
      data-testid="demo-next-step"
      className="mb-6 rounded-xl border-2 border-brand-gold/70 bg-brand-gold/10 p-4 sm:p-5"
    >
      <h2 id="demo-next-heading" className="flex items-center gap-2 font-semibold">
        <Users className="size-4 text-primary" aria-hidden /> Next: accept as your invitees
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        In real use, {first.name} would accept on their own account. In this demo you play every student: switch to{" "}
        {people.length === 1 ? "them" : "each invitee"} and accept. The team turns Active once everyone has answered.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <SwitchToInviteeButton person={first} size="default" />
        {rest.map((p) => (
          <SwitchToInviteeButton key={p.userId} person={p} size="default" variant="outline" />
        ))}
      </div>
    </section>
  );
}

