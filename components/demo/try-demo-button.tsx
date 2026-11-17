"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * One click, no sign-up: leases a private synthetic sandbox and signs in as
 * Jordan Lee (synthetic). Resumes the visitor's own sandbox if they have one.
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
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      const r = await apiFetch<{ resumed: boolean }>("/api/demo/start", { method: "POST", json: {} });
      // Full navigation so no request from a previous session can race the new cookies.
       
      window.location.assign(r.resumed ? "/spaces" : "/spaces?welcome=1");
    } catch (err) {
      const e = err as ApiClientError;
      setError(
        e.code === "DEMO_DISABLED"
          ? "The interactive demo isn't available on this deployment."
          : e.message,
      );
      setPending(false);
    }
  }

  return (
    <div className={cn("flex w-full flex-col gap-2 sm:w-auto", align === "center" ? "sm:items-center" : "sm:items-start")}>
      <Button size={size} onClick={start} disabled={pending} className={cn("w-full sm:w-auto", className)} aria-describedby={error ? "try-demo-error" : undefined}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Play data-icon="inline-start" aria-hidden />}
        {pending ? "Preparing your private sandbox…" : label}
      </Button>
      <p role="status" aria-live="polite" id="try-demo-error" className={cn("text-sm", error ? "text-destructive" : "sr-only")}>
        {error ?? (pending ? "Preparing your private demo sandbox." : "")}
      </p>
    </div>
  );
}
