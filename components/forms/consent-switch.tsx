"use client";

import { Switch } from "@/components/ui/switch";

/** Explicit, individually controlled consent (spec §3.3). Defaults are OFF upstream. */
export function ConsentSwitch({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-background p-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <p id={`${id}-desc`} className="mt-0.5 text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <span className="text-xs text-muted-foreground" aria-hidden>
          {checked ? "On" : "Off"}
        </span>
        <Switch id={id} checked={checked} onCheckedChange={(v) => onChange(v)} aria-describedby={`${id}-desc`} />
      </div>
    </div>
  );
}
