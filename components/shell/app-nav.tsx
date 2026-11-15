"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, currentSlug, hrefFor } from "./nav-items";

export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const slug = currentSlug(pathname);
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const href = hrefFor(item, slug);
        const active = item.spaceScoped
          ? slug !== null
            ? pathname.startsWith(`/s/${slug}/${item.path}`)
            : item.key === "discover" && pathname.startsWith("/spaces")
          : pathname === item.path || pathname.startsWith(`${item.path}/`);
        const Icon = item.icon;
        if (!item.available) {
          return (
            <span
              key={item.key}
              aria-disabled="true"
              className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground/60"
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
              <span className="ml-auto rounded border px-1 text-[10px] uppercase tracking-wide">Soon</span>
            </span>
          );
        }
        return (
          <Link
            key={item.key}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
            {item.spaceScoped && !slug && (
              <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                pick space
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
