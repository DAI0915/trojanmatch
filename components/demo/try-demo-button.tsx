"use client";

import { ArrowRight, Clock, Loader2, Play, PlayCircle, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { DEMO_VIDEO_URL } from "@/lib/demo/links";
import { cn } from "@/lib/utils";
import { useDemoStart } from "./demo-start";

function clock(t: number) {
  return new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function inMinutes(t: number, now: number) {
  const min = Math.max(1, Math.ceil((t - now) / 60_000));
  return min === 1 ? "in about a minute" : `in ${min} minutes`;
}

/**
 * One click, no sign-up: leases a private synthetic sandbox and signs in as
 * Jordan Lee (synthetic), or resumes this browser's sandbox. Shows why a start
 * was refused (with an accurate retry time and the video as an alternative).
 * Inside a DemoStartProvider it shares its state with other demo buttons.
 */
export function TryDemoButton({
  label = "Try Interactive Demo",
  size = "lg",
  className,
  align = "start",
}: {
  label?: string;
  size?: "default" | "lg";
  className?: string;
  align?: "start" | "center";
}) {
  const { pending, blocked, resumable, now, waiting, start } = useDemoStart();

  const text = pending
    ? resumable
      ? "Opening your sandbox…"
      : "Preparing your private sandbox…"
    : resumable
      ? "Resume your demo"
      : label;

  return (
    <div className={cn("flex w-full flex-col gap-2 sm:w-auto", align === "center" ? "sm:items-center" : "sm:items-start")}>
      <Button
        size={size}
        onClick={start}
        disabled={pending || waiting}
        className={cn("w-full sm:w-auto", className)}
        aria-describedby={blocked ? "try-demo-blocked" : undefined}
        data-testid="try-demo"
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Play data-icon="inline-start" aria-hidden />}
        {text}
      </Button>
      {resumable && !pending && !blocked && (
        <p className="text-sm text-muted-foreground">Your private sandbox is still open. Pick up where you left off.</p>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {pending ? "Preparing your private demo sandbox." : ""}
      </p>
      {blocked && (
        <div
          id="try-demo-blocked"
          role="alert"
          data-testid="try-demo-blocked"
          data-kind={blocked.kind}
          className="w-full max-w-md scroll-mt-24 rounded-xl border border-brand-gold/60 bg-brand-gold/10 p-4 text-left text-sm"
        >
          <p className="font-medium text-foreground">{blocked.title}</p>
          <p className="mt-1 text-muted-foreground">{blocked.message}</p>
          {blocked.retryAt != null && (
            <p className="mt-2 flex items-center gap-1.5 font-medium" data-testid="try-demo-retry">
              <Clock className="size-4 shrink-0 text-primary" aria-hidden />
              {waiting
                ? `You can start a new demo at ${clock(blocked.retryAt)} (${inMinutes(blocked.retryAt, now)}).`
                : "You can try again now."}
            </p>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a
              href={DEMO_VIDEO_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-full sm:w-auto")}
            >
              <PlayCircle data-icon="inline-start" aria-hidden /> Watch the 3-minute video
            </a>
            {!waiting && blocked.kind !== "other" && (
              <Button variant="ghost" size="sm" onClick={start} disabled={pending} className="w-full sm:w-auto">
                <RotateCw data-icon="inline-start" aria-hidden /> Try again
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A short line for first-time visitors; hidden while resuming, starting, or explaining a refusal. */
export function DemoStartHint({ children, className }: { children: React.ReactNode; className?: string }) {
  const { resumable, blocked, pending } = useDemoStart();
  if (resumable || blocked || pending) return null;
  return <p className={className}>{children}</p>;
}

/**
 * Compact header version: same action and state (use inside a DemoStartProvider
 * together with a TryDemoButton, which shows any "can't start" explanation).
 */
export function HeaderDemoButton({ className }: { className?: string }) {
  const { pending, resumable, waiting, start } = useDemoStart();

  async function onClick() {
    await start();
    // If the start was refused, bring the explanation (rendered by the main button) into view.
    requestAnimationFrame(() => {
      const panel = document.getElementById("try-demo-blocked");
      if (!panel) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    });
  }

  return (
    <Button onClick={onClick} disabled={pending || waiting} className={className} data-testid="try-demo-header">
      {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : null}
      {resumable ? (
        "Resume demo"
      ) : (
        <>
          <span className="sm:hidden">Try demo</span>
          <span className="hidden sm:inline">Try Interactive Demo</span>
        </>
      )}
      {!pending && <ArrowRight data-icon="inline-end" aria-hidden />}
    </Button>
  );
}
