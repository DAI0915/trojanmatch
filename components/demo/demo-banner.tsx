import Link from "next/link";
import { FlaskConical } from "lucide-react";

/** Always-visible label while acting as a synthetic persona. */
export function DemoBanner({ name }: { name: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-brand-gold/60 bg-brand-gold/15 px-4 py-1.5 text-center text-xs">
      <span className="inline-flex items-center gap-1.5 font-semibold">
        <FlaskConical className="size-3.5" aria-hidden /> Demo Mode
      </span>
      <span>
        Synthetic data only · You are <strong>{name}</strong> (synthetic persona)
      </span>
      <Link href="/demo" className="font-medium underline underline-offset-2">
        Demo controls
      </Link>
    </div>
  );
}
