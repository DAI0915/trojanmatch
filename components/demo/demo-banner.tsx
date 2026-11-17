import Link from "next/link";
import { FlaskConical, Settings2 } from "lucide-react";
import { DemoGuide } from "./demo-guide";
import { PersonaSwitcher, type PendingInvitee } from "./persona-switcher";

/** Always-visible label while acting as a synthetic persona in a private demo sandbox. */
export function DemoBanner({ name, personaKey, invitees }: { name: string; personaKey: string | null; invitees: PendingInvitee[] }) {
  return (
    <div
      role="region"
      aria-label="Demo Mode"
      data-testid="demo-bar"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-brand-gold/60 bg-brand-gold/15 px-4 py-1.5 text-center text-xs"
    >
      <span role="status" className="inline-flex items-center gap-1.5">
        <FlaskConical className="size-3.5" aria-hidden />
        <span>
          <strong>Demo Mode</strong> · Synthetic data · You are <strong>{name}</strong>
        </span>
      </span>
      <span className="inline-flex items-center gap-4">
        <PersonaSwitcher currentKey={personaKey} invitees={invitees} />
        <DemoGuide />
        <Link href="/demo" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
          <Settings2 className="size-3.5" aria-hidden /> Demo controls
        </Link>
      </span>
    </div>
  );
}
