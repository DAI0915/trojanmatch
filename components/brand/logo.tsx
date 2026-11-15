import Link from "next/link";
import { Users } from "lucide-react";

/** Wordmark. Deliberately NOT a USC mark — TrojanMatch is not an official USC app. */
export function Logo({ href = "/", prefetch }: { href?: string; prefetch?: boolean }) {
  return (
    <Link href={href} prefetch={prefetch} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Users className="size-4" aria-hidden />
      </span>
      <span>
        Trojan<span className="text-primary">Match</span>
      </span>
    </Link>
  );
}
