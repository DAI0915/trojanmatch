"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Opt = { id: string; label: string; group?: string; hint?: string };

/** Multi-select as toggle chips (aria-pressed). Optional grouping and limit. */
export function ChipSelect({
  options,
  value,
  onChange,
  max,
  grouped = false,
  size = "md",
}: {
  options: readonly Opt[];
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  grouped?: boolean;
  size?: "sm" | "md";
}) {
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (!max || value.length < max) onChange([...value, id]);
  };
  const groups = grouped
    ? [...new Set(options.map((o) => o.group ?? ""))].map((g) => ({ g, items: options.filter((o) => (o.group ?? "") === g) }))
    : [{ g: "", items: options }];
  const atMax = !!max && value.length >= max;

  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ g, items }) => (
        <div key={g || "all"} className="flex flex-col gap-1.5">
          {g && <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</p>}
          <div className="flex flex-wrap gap-1.5">
            {items.map((o) => {
              const on = value.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && atMax}
                  title={o.hint}
                  onClick={() => toggle(o.id)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40",
                    size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm",
                    on
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {on && <Check className="size-3.5" aria-hidden />}
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {max && (
        <p className="text-xs text-muted-foreground">
          {value.length} / {max} selected
        </p>
      )}
    </div>
  );
}
