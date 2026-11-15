"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronsUpDown, GraduationCap, Plus, Search, Trophy } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { currentSlug, type ShellSpace } from "./nav-items";

export function SpaceSwitcher({ spaces }: { spaces: ShellSpace[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const slug = currentSlug(pathname);
  const current = spaces.find((s) => s.slug === slug) ?? null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Change Matching Space"
        className={cn(
          "flex h-9 w-full min-w-0 max-w-xs items-center gap-2 rounded-md border bg-card px-3 text-left text-sm",
          "hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        )}
      >
        {current ? (
          current.type === "course" ? (
            <GraduationCap className="size-4 shrink-0 text-primary" aria-hidden />
          ) : (
            <Trophy className="size-4 shrink-0 text-primary" aria-hidden />
          )
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate">
          {current ? current.title : "No Space selected"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>My Spaces</DropdownMenuLabel>
          {spaces.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">You haven&apos;t joined a Space yet.</p>
          )}
          {spaces.map((s) => (
            <DropdownMenuItem key={s.id} onClick={() => router.push(`/s/${s.slug}/discover`)}>
              {s.type === "course" ? (
                <GraduationCap aria-hidden />
              ) : (
                <Trophy aria-hidden />
              )}
              <span className="truncate">{s.title}</span>
              {s.slug === slug && <Check className="ml-auto" aria-label="Current" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/spaces" />}>
          <Plus aria-hidden />
          Find or create a Space
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
