"use client";

import { cn } from "@/lib/utils";

type Opt = { id: string; label: string; hint?: string };

/** Single choice as a radio group of cards/pills. `nullable` allows clearing. */
export function Segmented({
  name,
  options,
  value,
  onChange,
  layout = "pills",
  nullable = false,
  ariaLabel,
}: {
  name: string;
  options: readonly Opt[];
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  layout?: "pills" | "cards";
  nullable?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel ?? name}
      className={cn(layout === "cards" ? "grid gap-2 sm:grid-cols-3" : "flex flex-wrap gap-1.5")}
    >
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(on && nullable ? null : o.id)}
            className={cn(
              "border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              layout === "cards" ? "rounded-lg px-3 py-2.5" : "rounded-full px-3 py-1 text-sm",
              on ? "border-primary bg-primary/10 text-primary" : "border-border bg-background hover:bg-muted",
            )}
          >
            <span className={cn("block", layout === "cards" ? "text-sm font-medium" : on ? "font-medium" : "")}>
              {o.label}
            </span>
            {layout === "cards" && o.hint && (
              <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
