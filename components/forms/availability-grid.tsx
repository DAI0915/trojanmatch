"use client";

import { useMemo } from "react";
import { BLOCKS, BLOCK_HOURS, DAYS, blockHours, localToUtcHours, utcToLocalHours } from "@/lib/availability";
import { cn } from "@/lib/utils";

/**
 * Weekly availability in 4-hour blocks, edited in the user's time zone and
 * emitted as UTC hour-of-week indices.
 */
export function AvailabilityGrid({
  valueUtc,
  onChange,
  timeZone,
  label = "Weekly availability",
}: {
  valueUtc: number[];
  onChange: (utcHours: number[]) => void;
  timeZone: string;
  label?: string;
}) {
  const local = useMemo(() => new Set(utcToLocalHours(valueUtc, timeZone)), [valueUtc, timeZone]);

  const cellOn = (day: number, start: number) => blockHours(day, start).every((h) => local.has(h));
  const toggle = (day: number, start: number) => {
    const hours = blockHours(day, start);
    const next = new Set(local);
    if (cellOn(day, start)) hours.forEach((h) => next.delete(h));
    else hours.forEach((h) => next.add(h));
    onChange(localToUtcHours(next, timeZone));
  };
  const toggleDay = (day: number) => {
    const all = BLOCKS.every((b) => cellOn(day, b.start));
    const next = new Set(local);
    BLOCKS.forEach((b) => blockHours(day, b.start).forEach((h) => (all ? next.delete(h) : next.add(h))));
    onChange(localToUtcHours(next, timeZone));
  };

  const hoursPerWeek = valueUtc.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] table-fixed border-separate border-spacing-1 text-xs" aria-label={label}>
          <thead>
            <tr>
              <th scope="col" className="w-12 text-left font-normal text-muted-foreground sm:w-14">
                <span className="sr-only">Time block</span>
              </th>
              {DAYS.map((d, i) => (
                <th key={d} scope="col" className="font-medium">
                  <button
                    type="button"
                    onClick={() => toggleDay(i)}
                    className="w-full rounded px-0.5 py-0.5 hover:bg-muted"
                    aria-label={`Toggle all of ${d}`}
                  >
                    {d}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BLOCKS.map((b) => (
              <tr key={b.start}>
                <th scope="row" className="whitespace-nowrap pr-1 text-left font-normal text-muted-foreground">
                  {b.label}
                </th>
                {DAYS.map((d, day) => {
                  const on = cellOn(day, b.start);
                  return (
                    <td key={d} className="p-0">
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={`${d} ${b.label}`}
                        onClick={() => toggle(day, b.start)}
                        className={cn(
                          "flex h-8 w-full items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                        )}
                      >
                        {on ? <span aria-hidden>✓</span> : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {hoursPerWeek} hours/week selected · shown in {timeZone.replace(/_/g, " ")} · {BLOCK_HOURS}-hour blocks
      </p>
    </div>
  );
}
