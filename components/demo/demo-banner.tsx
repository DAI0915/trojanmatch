import Link from "next/link";
import { ArrowRight, FlaskConical, Inbox, Info, RotateCcw } from "lucide-react";
import { DemoGuide } from "./demo-guide";
import { PersonaSwitcher, SwitchToInviteeButton, type SwitchContext } from "./persona-switcher";

/**
 * Persistent demo bar: who you are, the primary "Switch student" control, the
 * next step of the journey when there is one, and (set apart) restart/end.
 */
export function DemoBanner({ ctx }: { ctx: SwitchContext }) {
  const others = ctx.invited.filter((p) => p.userId !== ctx.current.userId);
  return (
    <div role="region" aria-label="Demo Mode" data-testid="demo-bar" className="border-b border-brand-gold/60 bg-brand-gold/15 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
        <span role="status" className="inline-flex min-w-0 items-center gap-2">
          <FlaskConical className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <strong>Demo Mode</strong> · Synthetic data · You are <strong data-testid="current-persona">{ctx.current.name}</strong>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <PersonaSwitcher ctx={ctx} />
          <DemoGuide />
        </span>
        <Link
          href="/demo"
          className="ml-auto inline-flex items-center gap-1 border-l border-brand-gold/60 pl-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Restart or end demo
        </Link>
      </div>

      {ctx.incoming > 0 ? (
        <Hint testId="demo-hint-incoming">
          <Inbox className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <strong>{ctx.current.name}</strong> has {ctx.incoming === 1 ? "an invitation" : `${ctx.incoming} invitations`} waiting.
          </span>
          <Link href="/invitations" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline">
            Review invitations <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Hint>
      ) : others.length > 0 ? (
        <Hint testId="demo-hint-invited">
          <Inbox className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            {others.length === 1 ? "1 invitation is" : `${others.length} invitations are`} waiting for an answer. Act as the invited
            student to accept:
          </span>
          <SwitchToInviteeButton person={others[0]} />
        </Hint>
      ) : (
        <Hint testId="demo-hint-tip" className="hidden sm:flex">
          <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            You can act as any of the {ctx.directory.length} synthetic students in your sandbox, for example to accept an invitation you sent.
          </span>
        </Hint>
      )}
    </div>
  );
}

function Hint({ children, testId, className = "flex" }: { children: React.ReactNode; testId: string; className?: string }) {
  return (
    <div
      data-testid={testId}
      className={`${className} flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-brand-gold/40 bg-background/60 px-4 py-2 sm:px-6`}
    >
      {children}
    </div>
  );
}
