"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/forms/field";
import { ApiClientError, apiFetch } from "@/lib/api/client";

/** Joins a Space by id. Shows a code field when the Space requires one. */
export function JoinSpaceForm({
  spaceId,
  requiresCode,
  label = "Join this Space",
  compact = false,
}: {
  spaceId: string;
  requiresCode: boolean;
  label?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (requiresCode && code.replace(/[^A-Za-z0-9]/g, "").length < 8) {
      setError("Enter the 8-character join code.");
      return;
    }
    setPending(true);
    try {
      const res = await apiFetch<{ joined: boolean; slug: string }>(`/api/spaces/${spaceId}/join`, {
        method: "POST",
        json: requiresCode ? { code } : {},
      });
      router.push(res.joined ? `/s/${res.slug}/setup?joined=1` : `/s/${res.slug}/discover`);
      router.refresh();
    } catch (err) {
      setError((err as ApiClientError).message);
      setPending(false);
    }
  }

  const id = `join-code-${spaceId}`;
  return (
    <form onSubmit={join} noValidate className={compact ? "flex flex-col gap-2 sm:flex-row" : "flex flex-col gap-3"}>
      {requiresCode && (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor={id} className={compact ? "sr-only" : "text-sm font-medium"}>
            Join code
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id={id}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. K7QM2XRP"
              autoComplete="off"
              spellCheck={false}
              maxLength={12}
              aria-invalid={!!error}
              aria-describedby={error ? `${id}-err` : undefined}
              className={`${inputClass} pl-9 font-mono tracking-widest uppercase`}
            />
          </div>
        </div>
      )}
      <Button type="submit" disabled={pending} className={compact ? "" : "w-full sm:w-auto"}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
        {label}
      </Button>
      {error && (
        <p id={`${id}-err`} role="alert" className="text-sm text-destructive sm:basis-full">
          {error}
        </p>
      )}
    </form>
  );
}
