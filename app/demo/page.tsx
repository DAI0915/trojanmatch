import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Clock, FlaskConical, Lock, PlayCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DemoControls } from "@/components/demo/demo-controls";
import { TryDemoButton } from "@/components/demo/try-demo-button";
import { serverFlags } from "@/lib/env";
import { LEASE_COOKIE, parseLeaseCookie, parsePersonaEmail } from "@/lib/demo/personas";
import { sha256Hex } from "@/lib/demo/crypto";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata = { title: "Interactive demo · TrojanMatch" };

const VIDEO_URL = "https://youtu.be/u0y4W5DaLL0";

export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  await connection();
  const sp = await searchParams;
  const { DEMO_MODE_ENABLED } = serverFlags();
  const { supabase, user } = await getCurrentUser();

  const scope = (user?.app_metadata as { scope?: string } | undefined)?.scope ?? null;
  const isDemoUser = !!user && !!scope?.startsWith("demo:");
  let leaseValid = false;
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
  const personaKey = isDemoUser ? (parsePersonaEmail(user?.email)?.key ?? null) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:py-10">
      <div className="flex items-center justify-between gap-4">
        <Logo href={isDemoUser && leaseValid ? "/spaces" : "/"} prefetch={false} />
        {isDemoUser && leaseValid && (
          <Link href="/spaces" prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to app
          </Link>
        )}
      </div>

      {!DEMO_MODE_ENABLED ? (
        <EmptyState
          icon={FlaskConical}
          title="The interactive demo isn't available"
          description="It is turned off on this deployment. You can still watch the recorded walkthrough."
        >
          <a href={VIDEO_URL} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline" })}>
            Watch the demo video
          </a>
        </EmptyState>
      ) : isDemoUser && leaseValid ? (
        <>
          <header>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-foreground">Your private sandbox</p>
            <h1 className="text-2xl font-semibold tracking-tight">Demo controls</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything here is synthetic and only visible to you. Restarting affects only your sandbox; other visitors and
              real students are never touched.
            </p>
          </header>
          <DemoControls currentPersona={personaKey} spaces={spaces} />
        </>
      ) : (
        <div className="grid gap-6 sm:grid-cols-[1fr_17rem]">
          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Interactive demo</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Try TrojanMatch in one click</h1>
            <p className="mb-5 mt-2 text-sm text-muted-foreground">
              No sign-up or password. You get a private sandbox with about 44 synthetic students and start as Jordan Lee.
              Generate a team, invite people, switch personas to accept, then open the team workspace and AI Kickoff.
            </p>
            {sp.expired === "1" && (
              <p role="status" className="mb-4 rounded-md bg-brand-gold/15 px-3 py-2 text-sm">
                Your demo session ended (it expired or was idle for 30 minutes). Start a fresh one below.
              </p>
            )}
            {!!user && !isDemoUser && (
              <p className="mb-3 text-xs text-muted-foreground">Starting the demo signs this browser out of your own account.</p>
            )}
            <TryDemoButton />
            <p className="mt-4 text-xs text-muted-foreground">
              Prefer a video?{" "}
              <a href={VIDEO_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">
                Watch the 3-minute walkthrough
              </a>
              .
            </p>
          </section>
          <aside className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p className="flex gap-2">
              <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Your sandbox is yours alone. Other visitors can&apos;t see, change or reset it.
            </p>
            <p className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Demo data lives in an isolated scope. Real students never see it, and it never sees them.
            </p>
            <p className="flex gap-2">
              <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Every person in the demo is synthetic and labeled that way.
            </p>
            <p className="flex gap-2">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              AI Kickoff uses Gemini within a small demo budget, then a labeled template.
            </p>
            <p className="flex gap-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Sessions last up to an hour and end after 30 idle minutes.
            </p>
            <p className="flex gap-2">
              <PlayCircle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Restart anytime from Demo controls.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
