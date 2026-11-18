import Link from "next/link";
import { ArrowRight, ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One of the three primary actions on Discover: a large, full-width link card.
 * All three use this one component with identical styling (equal visual weight).
 * The accessible name is the title; the description is attached as its
 * description. The CTA text is visual only (the whole card is the link).
 */
export function ActionCard({
  href,
  icon: Icon,
  title,
  body,
  cta,
  id,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  body: string;
  cta: string;
  id: string;
}) {
  // One grid, two arrangements. Mobile: [icon title] / [description] / [CTA].
  // sm+: [icon | title over description | CTA].
  return (
    <Link
      href={href}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-testid={`action-${id}`}
      className={cn(
        "group grid min-h-[8.25rem] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-2xl border bg-card p-5",
        "sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6 sm:gap-y-1 sm:p-7",
        "transition-[border-color,box-shadow] hover:border-primary/50 hover:shadow-md",
        "border-primary/35 shadow-sm active:shadow-sm",
        "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground sm:row-span-2 sm:size-14">
        <Icon className="size-6" aria-hidden />
      </span>
      <span id={`${id}-title`} className="text-xl font-semibold leading-tight tracking-tight sm:self-end sm:text-[1.375rem]">
        {title}
      </span>
      <span id={`${id}-body`} className="col-span-2 text-[0.9375rem] text-muted-foreground sm:col-span-1 sm:col-start-2 sm:self-start">
        {body}
      </span>
      <span
        aria-hidden
        className={cn(
          "col-span-2 inline-flex items-center gap-1.5 justify-self-start rounded-lg px-4 py-2 text-sm font-medium transition-colors",
          "sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1",
          "bg-primary text-primary-foreground group-hover:bg-primary/90 group-active:bg-primary/80",
        )}
      >
        {cta}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** Collapsed-by-default secondary section (native <details>: keyboard and screen-reader friendly). */
export function Disclosure({
  title,
  icon: Icon,
  children,
  open = false,
  testId,
}: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
  open?: boolean;
  testId?: string;
}) {
  return (
    <details open={open} className="group/d rounded-xl border bg-card" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        {title}
        <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open/d:rotate-180" aria-hidden />
      </summary>
      <div className="border-t px-4 py-4">{children}</div>
    </details>
  );
}
