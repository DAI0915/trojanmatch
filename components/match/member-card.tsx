import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MemberView } from "@/lib/matching/view";
import { cn } from "@/lib/utils";

const KIND: Record<MemberView["kind"], { label: string; className: string }> = {
  you: { label: "You", className: "border-primary/40 bg-primary/10 text-primary" },
  member: { label: "Accepted member", className: "border-primary/40 bg-primary/10 text-primary" },
  candidate: { label: "Candidate · not invited", className: "border-dashed text-muted-foreground" },
};

export function MemberCard({ member: m, actions, highlight }: { member: MemberView; actions?: React.ReactNode; highlight?: boolean }) {
  const kind = KIND[m.kind];
  return (
    <article
      data-testid="member-card"
      data-kind={m.kind}
      className={cn("flex h-full flex-col gap-3 rounded-xl border bg-card p-4", m.kind === "candidate" && "border-dashed", highlight && "ring-2 ring-primary/40")}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <UserRound className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium" data-testid="member-name">{m.name}</h3>
          <p className="text-sm text-primary">{m.role ?? m.roles[0] ?? "Role not set"}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge variant="outline" className={cn("font-normal", kind.className)}>{kind.label}</Badge>
        {m.synthetic && <Badge variant="outline" className="font-normal">Synthetic</Badge>}
        {m.goal && <Badge variant="secondary" className="font-normal">{m.goal}</Badge>}
      </div>
      {m.skills.length > 0 && <p className="text-xs text-muted-foreground">{m.skills.join(" · ")}</p>}
      {m.reasons.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" aria-label={`Why ${m.name}`}>
          {m.reasons.map((r) => (
            <li key={r} className="flex gap-1.5">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" aria-hidden /> {r}
            </li>
          ))}
        </ul>
      )}
      {actions && <div className="mt-auto flex flex-wrap gap-2 pt-1">{actions}</div>}
    </article>
  );
}
