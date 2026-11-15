"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/forms/field";
import { ApiClientError, apiFetch } from "@/lib/api/client";

export function DemoStartForm({ signedInAsReal }: { signedInAsReal: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setError("Enter the presenter code.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch("/api/demo/start", { method: "POST", json: { code } });
      router.push("/spaces");
      router.refresh();
    } catch (err) {
      setError((err as ApiClientError).message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={start} noValidate className="flex flex-col gap-3">
      <label htmlFor="presenter-code" className="text-sm font-medium">
        Presenter code
      </label>
      <div className="relative">
        <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id="presenter-code"
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={!!error}
          className={`${inputClass} pl-9`}
        />
      </div>
      {signedInAsReal && (
        <p className="text-xs text-muted-foreground">Starting the demo signs this browser out of your own account.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Play data-icon="inline-start" aria-hidden />}
        {pending ? "Preparing synthetic sandbox…" : "Start presenter demo"}
      </Button>
    </form>
  );
}
