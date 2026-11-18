"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ApiClientError, apiFetch } from "@/lib/api/client";

export type Blocked = {
  kind: "limit" | "busy" | "sessions" | "other";
  title: string;
  message: string;
  /** When the server says a new sandbox can be started (this visitor's own throttle / the pool). */
  retryAt: number | null;
};

export type DemoStart = {
  pending: boolean;
  blocked: Blocked | null;
  resumable: boolean;
  now: number;
  waiting: boolean;
  start: () => Promise<void>;
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

/**
 * Starting (or resuming) the password-free demo. If this browser already has a
 * sandbox it RESUMES it (the server never spends a new start on that). Repeated
 * clicks are ignored while a request is in flight, and while the server says the
 * visitor must wait. `enabled=false` makes it inert (no status request).
 */
function useDemoStartState(enabled: boolean): DemoStart {
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState<Blocked | null>(null);
  const [resumable, setResumable] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  // Does this browser already hold a sandbox? Then offer to resume it.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiFetch<{ lease: boolean }>("/api/demo/status")
      .then((r) => {
        if (!cancelled) setResumable(r.lease);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

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

  return { pending, blocked, resumable, now, waiting, start };
}

const DemoStartContext = createContext<DemoStart | null>(null);

/** Shares one demo-start state between several buttons on a page (e.g. header + hero). */
export function DemoStartProvider({ children }: { children: React.ReactNode }) {
  const state = useDemoStartState(true);
  return <DemoStartContext.Provider value={state}>{children}</DemoStartContext.Provider>;
}

/** The shared state when inside a DemoStartProvider, otherwise this component's own. */
export function useDemoStart(): DemoStart {
  const shared = useContext(DemoStartContext);
  const own = useDemoStartState(shared === null);
  return shared ?? own;
}
