"use client";

import { useEffect, useState } from "react";
import { Link2, Loader2, Share2 } from "lucide-react";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { CopyButton } from "./copy-button";

/** Any participant can share the Space. Join codes are fetched on demand (participants only). */
export function InviteLinkCard({ spaceId, emphasize = false }: { spaceId: string; emphasize?: boolean }) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; url: string; code: string | null }
  >({ status: "loading" });

  useEffect(() => {
    let alive = true;
    apiFetch<{ url: string; join_code: string | null }>(`/api/spaces/${spaceId}/invite-link`, { cache: "no-store" })
      .then((r) => alive && setState({ status: "ready", url: r.url, code: r.join_code }))
      .catch((e: ApiClientError) => alive && setState({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
  }, [spaceId]);

  return (
    <section
      aria-labelledby={`invite-${spaceId}`}
      className={`rounded-xl border p-4 sm:p-5 ${emphasize ? "border-primary/30 bg-primary/5" : "bg-card"}`}
    >
      <h2 id={`invite-${spaceId}`} className="flex items-center gap-2 font-medium">
        <Share2 className="size-4 text-primary" aria-hidden /> Invite others to join
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        The link opens this Space; each person decides to join. It does not reveal who is here.
      </p>
      {state.status === "loading" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading invite link…
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {state.message}
        </p>
      )}
      {state.status === "ready" && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code
              data-testid="invite-url"
              className="flex min-w-0 flex-1 items-center gap-2 truncate rounded-md border bg-background px-3 py-2 text-xs"
            >
              <Link2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{state.url}</span>
            </code>
            <CopyButton text={state.url} label="Link" />
          </div>
          {state.code && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2 rounded-md border bg-background px-3 py-2">
                <span className="text-xs text-muted-foreground">Join code</span>
                <code data-testid="join-code" className="font-mono text-sm font-semibold tracking-[0.2em]">
                  {state.code}
                </code>
              </div>
              <CopyButton text={state.code} label="Code" />
            </div>
          )}
          {state.code && (
            <p className="text-xs text-muted-foreground">
              Share the code only with classmates in this course. Anyone with link + code can join.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
