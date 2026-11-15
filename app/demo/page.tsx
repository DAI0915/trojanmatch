import { connection } from "next/server";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { serverFlags } from "@/lib/env";

export default async function DemoPage() {
  await connection(); // flags are read per request, not frozen at build
  const { DEMO_MODE_ENABLED } = serverFlags();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <Logo />
      <EmptyState
        icon={FlaskConical}
        title={DEMO_MODE_ENABLED ? "Demo Mode" : "Demo Mode isn't available yet"}
        description="Demo Mode uses clearly labeled synthetic participants in an isolated sandbox. It never mixes with real students' data."
      >
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Back to home
        </Link>
      </EmptyState>
    </div>
  );
}
