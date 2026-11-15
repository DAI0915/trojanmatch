import Link from "next/link";
import { HelmetMark } from "./helmet-mark";

/** Wordmark. Deliberately NOT a USC mark — TrojanMatch is not an official USC app. */
export function Logo({ href = "/", prefetch }: { href?: string; prefetch?: boolean }) {
  return (
    <Link href={href} prefetch={prefetch} className="flex items-center gap-2 font-semibold tracking-tight">
      <HelmetMark className="size-7" />
      <span>
        <span className="text-foreground">Trojan</span>
        <span className="text-primary">Match</span>
      </span>
    </Link>
  );
}
