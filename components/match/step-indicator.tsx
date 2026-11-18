import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Set preferences", "Review team", "Send invitations"] as const;

/**
 * 1 Set preferences — 2 Review team — 3 Send invitations.
 * Completed steps show a check; a completed step can be revisited when `onSelect` allows it.
 * On narrow screens only the current step's label is shown.
 */
export function StepIndicator({ current, onSelect }: { current: 1 | 2 | 3; onSelect?: (step: 1 | 2) => void }) {
  return (
    <nav aria-label="Team formation steps" data-testid="formation-steps">
      <ol className="flex items-center justify-center gap-2 sm:gap-3">
        {STEPS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const done = n < current;
          const active = n === current;
          const clickable = done && n < 3 && !!onSelect;
          const inner = (
            <>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  done || active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
              </span>
              <span
                className={cn(
                  "text-sm",
                  active ? "font-semibold text-primary" : done ? "font-medium text-primary" : "text-muted-foreground",
                  !active && "hidden sm:inline",
                )}
              >
                {label}
              </span>
              <span className="sr-only">{done ? " (done)" : active ? " (current step)" : ""}</span>
            </>
          );
          return (
            <li key={label} className="flex items-center gap-2 sm:gap-3" aria-current={active ? "step" : undefined}>
              {i > 0 && <span aria-hidden className={cn("h-px w-5 sm:w-12", n <= current ? "bg-primary/60" : "bg-border")} />}
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSelect!(n as 1 | 2)}
                  className="flex items-center gap-2 rounded-full pr-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {inner}
                </button>
              ) : (
                <span className="flex items-center gap-2">{inner}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
