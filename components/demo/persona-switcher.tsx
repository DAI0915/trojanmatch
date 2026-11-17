"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2, Mail, Users } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { SWITCHABLE_PERSONAS } from "@/lib/demo/personas";

export type PendingInvitee = { userId: string; name: string };

/** Switch the synthetic persona this browser acts as (same private sandbox). */
export function PersonaSwitcher({ currentKey, invitees }: { currentKey: string | null; invitees: PendingInvitee[] }) {
  const [busy, setBusy] = useState(false);

  async function switchTo(json: { persona: string } | { userId: string }, toInbox = false) {
    setBusy(true);
    try {
      await apiFetch("/api/demo/switch", { method: "POST", json });
      // Full navigation: no stale client cache or in-flight prefetch from the previous persona.
       
      window.location.assign(toInbox ? "/invitations" : "/spaces");
    } catch (err) {
      const e = err as ApiClientError;
      toast.error(e.message);
      setBusy(false);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- session ended; go to the demo start page
      if (e.code === "DEMO_LEASE_INVALID") window.location.assign("/demo?expired=1");
    }
  }

  const featured = new Set<string>(SWITCHABLE_PERSONAS.map((p) => p.name));
  const extra = invitees.filter((i) => !featured.has(i.name));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        className="inline-flex items-center gap-1 rounded font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Users className="size-3.5" aria-hidden />}
        Switch persona <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Synthetic students in your sandbox</DropdownMenuLabel>
          {SWITCHABLE_PERSONAS.map((p) => {
            const pending = invitees.some((i) => i.name === p.name);
            return (
              <DropdownMenuItem key={p.key} disabled={p.key === currentKey} onClick={() => switchTo({ persona: p.key }, pending)}>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 font-medium">
                    {p.name}
                    {pending && <span className="rounded bg-brand-gold/25 px-1 text-[10px] font-semibold">Invited</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.blurb}</span>
                </span>
                {p.key === currentKey && <Check className="ml-auto" aria-label="Current persona" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
        {extra.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>People you invited</DropdownMenuLabel>
              {extra.map((i) => (
                <DropdownMenuItem key={i.userId} onClick={() => switchTo({ userId: i.userId }, true)}>
                  <Mail aria-hidden />
                  <span className="truncate">Act as {i.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
