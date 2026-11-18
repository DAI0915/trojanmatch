"use client";

import { useId, useState } from "react";
import { ChevronDown, Loader2, Repeat2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui/person-avatar";
import type { MemberView } from "@/lib/matching/view";
import { memberHighlight } from "@/lib/matching/why";
import { cn } from "@/lib/utils";

const KIND: Record<MemberView["kind"], { label: string; className: string; hint: string }> = {
  you: { label: "You", className: "bg-primary/10 text-primary", hint: "You (team owner)" },
  member: { label: "Teammate", className: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200", hint: "Already accepted and on your team" },
  candidate: { label: "Not invited yet", className: "border border-dashed text-muted-foreground", hint: "Recommended candidate · nobody has been invited" },
};

/**
 * Compact card for one recommended teammate: who, which role, one data-grounded
 * line, and Replace. Everything else (skills, goal, all reasons, "Don't suggest")
 * is one click away under Details.
 */
export function TeamMemberCard({
  member: m,
  highlight,
  onReplace,
  replacing,
  replaceDisabled,
  onExclude,
  excludeDisabled,
}: {
  member: MemberView;
  highlight?: boolean;
  onReplace?: () => void;
  replacing?: boolean;
  replaceDisabled?: boolean;
  onExclude?: () => void;
  excludeDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  const kind = KIND[m.kind];
  const line = memberHighlight(m.reasons);
  const role = m.role ?? m.roles[0] ?? "Role not set";

  return (
    <article
      data-testid="member-card"
      data-kind={m.kind}
      className={cn("flex flex-col rounded-xl border bg-card p-4", highlight && "ring-2 ring-primary/40")}
    >
      <div className="flex items-start gap-3">
        <PersonAvatar name={m.name} seed={m.id} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="min-w-0 truncate font-semibold leading-6" data-testid="member-name">{m.name}</h3>
            {m.kind === "candidate" && onReplace ? (
              <Button variant="outline" size="sm" onClick={onReplace} disabled={replaceDisabled} aria-label={`Replace ${m.name}`} className="-mt-0.5 shrink-0">
                {replacing ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Repeat2 data-icon="inline-start" aria-hidden />}
                Replace
              </Button>
            ) : (
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", kind.className)} title={kind.hint} data-testid="member-kind">
                {kind.label}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-primary">{role}</p>
          {line && <p className="mt-1.5 text-sm text-muted-foreground" data-testid="member-highlight">{line}</p>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[3.25rem] text-xs">
        {m.kind === "candidate" && (
          <span className="text-muted-foreground" title={kind.hint} data-testid="member-kind">{kind.label}</span>
        )}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-0.5 font-medium text-foreground/80 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Details
          <span className="sr-only"> about {m.name}</span>
          <ChevronDown className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        </button>
      </div>

      {open && (
        <div id={detailsId} className="mt-3 flex flex-col gap-2 border-t pt-3 text-sm" data-testid="member-details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {m.roles.length > 0 && (
              <>
                <dt className="text-muted-foreground">Roles</dt>
                <dd>{m.roles.join(", ")}</dd>
              </>
            )}
            {m.skills.length > 0 && (
              <>
                <dt className="text-muted-foreground">Skills</dt>
                <dd>{m.skills.join(" · ")}</dd>
              </>
            )}
            {m.goal && (
              <>
                <dt className="text-muted-foreground">Goal</dt>
                <dd>{m.goal}</dd>
              </>
            )}
            {m.experience && (
              <>
                <dt className="text-muted-foreground">Experience</dt>
                <dd className="capitalize">{m.experience}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              {kind.hint}
              {m.synthetic ? " · synthetic profile" : ""}
            </dd>
          </dl>
          {m.reasons.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label={`Why ${m.name}`}>
              {m.reasons.map((r) => (
                <li key={r} className="flex gap-1.5">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" aria-hidden /> {r}
                </li>
              ))}
            </ul>
          )}
          {m.kind === "candidate" && onExclude && (
            <div>
              <Button variant="ghost" size="sm" onClick={onExclude} disabled={excludeDisabled} aria-label={`Don't suggest ${m.name}`} className="-ml-2">
                <UserX data-icon="inline-start" aria-hidden /> Don&apos;t suggest {m.name.split(" ")[0]}
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
