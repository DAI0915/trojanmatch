"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Loader2, Play, PlayCircle, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { DEMO_VIDEO_URL } from "@/lib/demo/links";
import { cn } from "@/lib/utils";

type Blocked = {
  kind: "limit" | "busy" | "sessions" | "other";
  title: string;
  message: string;
  /** When the server says a new sandbox can be started (this visitor's own throttle / the pool). */
  retryAt: number | null;
};

function blockedFrom(e: ApiClientError): Blocked {
  const details = (e.details ?? {}) as unknown as { retry_at?: string | null; reason?: string };
  const at = details.retry_at ? Date.parse(details.retry_at) : NaN;
  const retryAt = Number.isFinite(at) ? at : null;
  if (e.code === "DEMO_DISABLED") {
    return { kind: "other", title: "The interactive demo isn't available", message: "It's turned off on this deployment.", retryAt: null };
  }
  if (e.code === "DEMO_BUSY") {
    return { kind: "busy", title: "All demo sandboxes are in use", message: "Each visitor gets a private sandbox, and they're all taken right now.", retryAt };
  }
  if (e.code === "RATE_LIMITED" && details.reason === "TOO_MANY_SESSIONS") {
    return { kind: "sessions", title: "You already have demo sandboxes open", message: e.message, retryAt: null };
  }
  if (e.code === "RATE_LIMITED") {
    return {
      kind: "limit",
      title: "Demo limit reached for your network",
      message: "To keep sandboxes available for everyone, each network can start a limited number of new demos per hour.",
      retryAt,
    };
  }
  return { kind: "other", title: "The demo couldn't start", message: e.message, retryAt: null };
}

function clock(t: number) {
  return new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function inMinutes(t: number, now: number) {
  const min = Math.max(1, Math.ceil((t - now) / 60_000));
  return min === 1 ? "in about a minute" : `in ${min} minutes`;
}

/**
 * One click, no sign-up: leases a private synthetic sandbox and signs in as
 * Jordan Lee (synthetic). If this browser already has a sandbox it RESUMES it
 * (the server never spends a new start on that). Repeated clicks are ignored
 * while a request is in flight, and while the server says the visitor must wait.
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
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [resumable, setResumable] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  // Does this browser already hold a sandbox? Then offer to resume it.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ lease: boolean }>("/api/demo/status")
      .then((r) => {
        if (!cancelled) setResumable(r.lease);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick while waiting for the retry time, so the countdown and the button update by themselves.
  const waiting = blocked?.retryAt != null && blocked.retryAt > now;
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [waiting]);

  async function start() {
    if (inFlight.current || waiting) return; // double clicks never start two sandboxes
    inFlight.current = true;
    setPending(true);
    setBlocked(null);
    try {
      const r = await apiFetch<{ resumed: boolean }>("/api/demo/start", { method: "POST", json: {} });
      // Full navigation so no request from a previous session can race the new cookies.
      window.location.assign(r.resumed ? "/spaces" : "/spaces?welcome=1");
    } catch (err) {
      setBlocked(blockedFrom(err as ApiClientError));
      setNow(Date.now());
      setPending(false);
      inFlight.current = false;
    }
  }

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
          className="w-full max-w-md rounded-xl border border-brand-gold/60 bg-brand-gold/10 p-4 text-left text-sm"
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
