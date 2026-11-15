import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function SpaceNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Space not found"
      description="The link may be wrong, or this Space isn't available to your account."
    >
      <Link href="/spaces" className={buttonVariants({ variant: "outline" })}>
        Browse Spaces
      </Link>
    </EmptyState>
  );
}
