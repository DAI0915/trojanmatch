import Link from "next/link";
import { HelmetMark } from "./helmet-mark";

/** Wordmark. Deliberately NOT a USC mark — TrojanMatch is not an official USC app. */
export function Logo({ href = "/", prefetch, size = "default" }: { href?: string; prefetch?: boolean; size?: "default" | "lg" }) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={size === "lg" ? "flex items-center gap-2 text-lg font-bold tracking-tight sm:gap-2.5 sm:text-[1.4rem]" : "flex items-center gap-2 font-semibold tracking-tight"}
    >
      <HelmetMark className={size === "lg" ? "size-7 sm:size-9" : "size-7"} />
      <span>
        <span className="text-foreground">Trojan</span>
        <span className="text-primary">Match</span>
      </span>
    </Link>
  );
}
