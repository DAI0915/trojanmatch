"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, LogOut, RotateCcw, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/forms/field";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { SWITCHABLE_PERSONAS } from "@/lib/demo/personas";
import { cn } from "@/lib/utils";

type DemoSpace = { id: string; title: string; participant_count: number };

export function DemoControls({ currentPersona, spaces }: { currentPersona: string | null; spaces: DemoSpace[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [spaceId, setSpaceId] = useState(spaces[0]?.id ?? "");
  const [count, setCount] = useState(12);

  async function run(label: string, fn: () => Promise<unknown>, success: string) {
    setBusy(label);
    try {
      await fn();
      toast.success(success);
      router.refresh();
    } catch (err) {
      const e = err as ApiClientError;
      toast.error(e.message);
      if (e.code === "DEMO_LEASE_INVALID") router.push("/demo?expired=1");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="persona-heading" className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 id="persona-heading" className="flex items-center gap-2 font-medium">
          <Users className="size-4 text-primary" aria-hidden /> Switch persona
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quick access to four personas. To act as any of the 44 synthetic students in your private sandbox, use Switch student in the yellow demo bar.
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {SWITCHABLE_PERSONAS.map((p) => {
            const current = p.key === currentPersona;
            return (
              <li key={p.key}>
                <button
                  type="button"
                  disabled={current || !!busy}
                  aria-pressed={current}
                  onClick={async () => {
                    setBusy(`switch-${p.key}`);
                    try {
                      await apiFetch("/api/demo/switch", { method: "POST", json: { persona: p.key } });
                      // Full navigation: no stale client cache or in-flight prefetch from the previous persona.
                      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload is required to drop the previous persona session state (avoids a cookie race)
                      window.location.assign("/spaces");
                    } catch (err) {
                      const e = err as ApiClientError;
                      toast.error(e.message);
                      setBusy(null);
                      if (e.code === "DEMO_LEASE_INVALID") router.push("/demo?expired=1");
                    }
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default",
                    current ? "border-primary bg-primary/5" : "hover:bg-muted",
                  )}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {busy === `switch-${p.key}` ? <Loader2 className="size-4 animate-spin" aria-hidden /> : p.name[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {p.name} {current && <Check className="size-3.5 text-primary" aria-label="current" />}
                    </span>
                    <span className="block text-xs text-muted-foreground">{p.blurb}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="sim-heading" className="rounded-xl border bg-card p-4 sm:p-5">
        <h2 id="sim-heading" className="flex items-center gap-2 font-medium">
          <UserPlus className="size-4 text-primary" aria-hidden /> Simulate participants joining
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional: create a new Space (for example TreeHacks 2027), then have synthetic students join it through the
          normal join rules. They are labeled as simulated.
        </p>
        {spaces.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No demo Spaces available to this persona.</p>
        ) : (
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              run("simulate", () => apiFetch("/api/demo/simulate-joins", { method: "POST", json: { spaceId, count } }), `Simulated up to ${count} synthetic participants joining.`);
            }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label htmlFor="sim-space" className="text-sm font-medium">Space</label>
              <select id="sim-space" className={inputClass} value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} ({s.participant_count})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-28">
              <label htmlFor="sim-count" className="text-sm font-medium">How many</label>
              <input id="sim-count" type="number" min={1} max={40} className={inputClass} value={count} onChange={(e) => setCount(Math.max(1, Math.min(40, Number(e.target.value) || 1)))} />
            </div>
            <Button type="submit" disabled={!!busy || !spaceId}>
              {busy === "simulate" && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />}
              Simulate joins
            </Button>
          </form>
        )}
      </section>

      <section aria-labelledby="reset-heading" className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 id="reset-heading" className="font-medium">Restart or end</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Restart puts your sandbox back to its starting state and signs you in as Jordan again. Only your sandbox is
            affected.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() => {
              if (window.confirm("Restart your demo? Teams, invitations and Spaces you created will be removed.")) {
                setBusy("reset");
                apiFetch("/api/demo/reset", { method: "POST", json: {} })
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload: the session is now Jordan again
                  .then(() => window.location.assign("/spaces?welcome=1"))
                  .catch((err: ApiClientError) => {
                    toast.error(err.message);
                    setBusy(null);
                    if (err.code === "DEMO_LEASE_INVALID") router.push("/demo?expired=1");
                  });
              }
            }}
          >
            {busy === "reset" ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <RotateCcw data-icon="inline-start" aria-hidden />}
            Restart demo
          </Button>
          <Button
            variant="ghost"
            disabled={!!busy}
            onClick={async () => {
              setBusy("end");
              await apiFetch("/api/demo/end", { method: "POST", json: {} }).catch(() => undefined);
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload is required to drop the previous persona session state (avoids a cookie race)
              window.location.assign("/demo");
            }}
          >
            <LogOut data-icon="inline-start" aria-hidden /> End demo
          </Button>
        </div>
      </section>
    </div>
  );
}
