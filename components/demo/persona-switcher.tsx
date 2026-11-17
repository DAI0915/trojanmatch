"use client";

import { useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Mail, Search, Users, UsersRound, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import type { DirectoryPerson } from "@/lib/demo/directory";
import { cn } from "@/lib/utils";

/** A sandbox student known by user id (visible to the current persona through RLS). */
export type DemoPerson = { userId: string; name: string; team: string | null };
export type SwitchContext = {
  current: { key: string | null; name: string; userId: string };
  directory: DirectoryPerson[];
  /** Pending invitations the current persona can see (sent by their team). */
  invited: DemoPerson[];
  /** Active members of the current persona's teams. */
  teammates: DemoPerson[];
  /** Invitations waiting for the current persona. */
  incoming: number;
};

type Target = { persona: string } | { userId: string };

/**
 * Switches this browser to another synthetic student of the SAME sandbox. The
 * server resolves the target against the lease's slot and derives credentials
 * itself; the browser only names a fixture key or a user id it can already see.
 */
export function useDemoSwitch() {
  const [busy, setBusy] = useState<string | null>(null);
  async function switchTo(id: string, json: Target, dest: "/invitations" | "/teams" | "/spaces") {
    setBusy(id);
    try {
      await apiFetch("/api/demo/switch", { method: "POST", json });
      // Full navigation: no stale client cache or in-flight prefetch from the previous persona.
      window.location.assign(dest);
    } catch (err) {
      const e = err as ApiClientError;
      toast.error(e.message);
      setBusy(null);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- session ended; go to the demo start page
      if (e.code === "DEMO_LEASE_INVALID") window.location.assign("/demo?expired=1");
    }
  }
  return { busy, switchTo };
}

/** Contextual call to action: "Switch to Maya Chen to accept the invitation". */
export function SwitchToInviteeButton({
  person,
  size = "sm",
  variant = "default",
}: {
  person: DemoPerson;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}) {
  const { busy, switchTo } = useDemoSwitch();
  return (
    <Button size={size} variant={variant} className="w-full sm:w-auto" disabled={busy !== null} onClick={() => switchTo(person.userId, { userId: person.userId }, "/invitations")}>
      {busy ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Users data-icon="inline-start" aria-hidden />}
      Switch to {person.name}
    </Button>
  );
}

type Row = {
  id: string;
  name: string;
  detail: string;
  badge?: string;
  target: Target;
  dest: "/invitations" | "/teams" | "/spaces";
  current: boolean;
};

function buildGroups(ctx: SwitchContext) {
  const invitedNames = new Set(ctx.invited.map((p) => p.name));
  const shown = new Set<string>();
  const fromPeople = (people: DemoPerson[], badge: string, dest: Row["dest"]): Row[] =>
    people
      .filter((p) => !shown.has(p.name) && shown.add(p.name))
      .map((p) => ({
        id: p.userId,
        name: p.name,
        detail: p.team ? `${badge} · ${p.team}` : badge,
        badge,
        target: { userId: p.userId },
        dest,
        current: p.userId === ctx.current.userId,
      }));
  const invited = fromPeople(ctx.invited, "Invited", "/invitations");
  const team = fromPeople(ctx.teammates, "Teammate", "/teams");
  const fromDir = (d: DirectoryPerson): Row => ({
    id: d.key,
    name: d.name,
    detail: d.blurb ?? d.roles,
    badge: invitedNames.has(d.name) ? "Invited" : undefined,
    target: { persona: d.key },
    dest: invitedNames.has(d.name) ? "/invitations" : "/spaces",
    current: d.key === ctx.current.key,
  });
  const quick = ctx.directory.filter((d) => d.quick && !shown.has(d.name)).map(fromDir);
  quick.forEach((r) => shown.add(r.name));
  const everyone = ctx.directory.filter((d) => !shown.has(d.name)).map(fromDir);
  return [
    { id: "invited", title: "Invited, waiting for an answer", icon: Mail, rows: invited },
    { id: "team", title: "Your team", icon: UsersRound, rows: team },
    { id: "quick", title: "Quick access", icon: Zap, rows: quick },
    { id: "all", title: "All students in your sandbox", icon: Users, rows: everyone },
  ];
}

/** "Switch student" picker: invited and teammates first, then quick access, then every student (searchable). */
export function PersonaSwitcher({ ctx, triggerClassName }: { ctx: SwitchContext; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { busy, switchTo } = useDemoSwitch();
  const listRef = useRef<HTMLDivElement>(null);

  const groups = buildGroups(ctx);

  const needle = q.trim().toLowerCase();
  const visible = groups
    .map((g) => ({ ...g, rows: needle ? g.rows.filter((r) => `${r.name} ${r.detail}`.toLowerCase().includes(needle)) : g.rows }))
    .filter((g) => g.rows.length > 0);

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        disabled={busy !== null}
        className={cn("h-7 gap-1.5 px-2.5", triggerClassName)}
        aria-haspopup="dialog"
        data-testid="switch-student"
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Users aria-hidden />}
        Switch student
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQ("");
        }}
      >
        <DialogContent
          className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-md"
          data-testid="student-picker"
          // Touch: focus the list, not the search box, so the on-screen keyboard doesn't cover the students.
          initialFocus={(type) => (type === "touch" ? listRef.current : true)}
        >
          <DialogHeader>
            <DialogTitle>Act as another student</DialogTitle>
            <DialogDescription>
              You’re <strong className="text-foreground">{ctx.current.name}</strong>. Switch to any of the {ctx.directory.length} synthetic
              students in your private sandbox to try both sides: send an invitation as one student, then accept it as another.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or role"
              aria-label="Search students"
              className="h-9 pl-8"
            />
          </div>
          <div ref={listRef} tabIndex={-1} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 outline-none" data-testid="student-list">
            {visible.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No student matches “{q}”.</p>}
            {visible.map((g) => (
              <section key={g.id} aria-label={g.title} className="mb-3">
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <g.icon className="size-3.5" aria-hidden /> {g.title}
                </h3>
                <ul className="flex flex-col">
                  {g.rows.map((r) => (
                    <li key={`${g.id}-${r.id}`}>
                      <button
                        type="button"
                        disabled={r.current || busy !== null}
                        aria-label={r.current ? `${r.name} (current)` : `Switch to ${r.name}`}
                        onClick={() => switchTo(r.id, r.target, r.dest)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default disabled:hover:bg-transparent"
                      >
                        <PersonAvatar name={r.name} size="sm" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="truncate">{r.name}</span>
                            {r.badge === "Invited" && <span className="shrink-0 rounded bg-brand-gold/30 px-1 text-[10px] font-semibold">Invited</span>}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">{r.detail}</span>
                        </span>
                        {r.current ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
                            <Check className="size-3.5" aria-hidden /> You
                          </span>
                        ) : busy === r.id ? (
                          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
