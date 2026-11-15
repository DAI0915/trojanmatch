import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DemoControls } from "@/components/demo/demo-controls";
import { DemoStartForm } from "@/components/demo/demo-start-form";
import { serverFlags } from "@/lib/env";
import { LEASE_COOKIE, parseLeaseCookie } from "@/lib/demo/personas";
import { sha256Hex } from "@/lib/demo/crypto";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  await connection();
  const sp = await searchParams;
  const { DEMO_MODE_ENABLED } = serverFlags();
  const { supabase, user } = await getCurrentUser();

  const scope = (user?.app_metadata as { scope?: string } | undefined)?.scope ?? null;
  const isDemoUser = !!user && !!scope?.startsWith("demo:");
  let leaseValid = false;
  const leasedUntil: string | null = null;
  let spaces: { id: string; title: string; participant_count: number }[] = [];

  if (isDemoUser) {
    const lease = parseLeaseCookie((await cookies()).get(LEASE_COOKIE)?.value);
    if (lease) {
      const { data } = await supabase.rpc("demo_lease_valid", { p_token_hash: sha256Hex(lease.token) });
      leaseValid = data === true;
    }
    if (leaseValid) {
      const { data } = await supabase.rpc("search_spaces", { p_limit: 50 });
      spaces = (data ?? []).map((s) => ({ id: s.id, title: s.title, participant_count: Number(s.participant_count) }));
    }
  }
  const personaKey = isDemoUser && user?.email ? user.email.split(".s")[0] : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <Logo href={isDemoUser ? "/spaces" : "/"} prefetch={false} />
        {isDemoUser && leaseValid && (
          <Link href="/spaces" prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to app
          </Link>
        )}
      </div>

      {!DEMO_MODE_ENABLED ? (
        <EmptyState
          icon={FlaskConical}
          title="Demo Mode isn't available"
          description="Demo Mode uses clearly labeled synthetic participants in an isolated sandbox. It is turned off on this deployment."
        >
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Back to home
          </Link>
        </EmptyState>
      ) : isDemoUser && leaseValid ? (
        <>
          <header>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-foreground">Presenter sandbox</p>
            <h1 className="text-2xl font-semibold tracking-tight">Demo controls</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything here is synthetic and isolated from real students. Spaces you create during the demo disappear on reset.
            </p>
          </header>
          <DemoControls currentPersona={personaKey} spaces={spaces} leasedUntil={leasedUntil} />
        </>
      ) : (
        <div className="grid gap-6 sm:grid-cols-[1fr_18rem]">
          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <h1 className="text-xl font-semibold tracking-tight">Presenter demo</h1>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              Starts an isolated sandbox with ~44 clearly labeled synthetic students, then signs you in as the synthetic
              persona Jordan.
            </p>
            {sp.expired === "1" && (
              <p role="status" className="mb-4 rounded-md bg-brand-gold/15 px-3 py-2 text-sm">
                Your demo session ended (it expired, or the demo was started from another browser).
              </p>
            )}
            <DemoStartForm signedInAsReal={!!user && !isDemoUser} />
          </section>
          <aside className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Demo data lives in a separate sandbox scope. Production students never see it, and it never sees them.
            </p>
            <p className="flex gap-2">
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Every synthetic person and simulated join is labeled in the interface.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
