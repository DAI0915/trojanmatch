import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/** Muted, deterministic tints (by id) so teammates are easy to tell apart. */
const TINTS = [
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function tint(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

/** Initials avatar; falls back to a generic icon when the name isn't shared. */
export function PersonAvatar({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  seed?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const text = name ? initials(name) : "";
  const box = size === "sm" ? "size-7 text-[11px]" : size === "lg" ? "size-10 text-sm" : "size-9 text-xs";
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        box,
        text ? tint(seed ?? name ?? "") : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {text || <UserRound className="size-3.5" />}
    </span>
  );
}
