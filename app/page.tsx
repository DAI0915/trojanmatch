import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function LandingPage() {
  const { user } = await getCurrentUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/spaces" className={buttonVariants()}>
              Open app <ArrowRight data-icon="inline-end" />
            </Link>
          ) : (
            <Link href="/sign-in" className={buttonVariants({ variant: "ghost" })}>
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
        <section className="py-16 sm:py-24">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-brand-gold" aria-hidden />
            For USC students · hackathons &amp; course projects
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Stop searching. <span className="text-primary">Start building.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            Join the Matching Space for your exact hackathon or class assignment, then find a team,
            grow yours, or let AI propose a complete team. AI recommends. Humans decide.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={user ? "/spaces" : "/sign-in"} className={buttonVariants({ size: "lg" })}>
              Find Your Team <ArrowRight data-icon="inline-end" />
            </Link>
            <Link href="/demo" className={buttonVariants({ size: "lg", variant: "outline" })}>
              Try Demo Mode
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-3">
          {[
            {
              icon: UsersRound,
              title: "One Space, relevant people",
              body: "Every search and recommendation is limited to the hackathon edition or course assignment you joined.",
            },
            {
              icon: Sparkles,
              title: "Team-level matching",
              body: "Optimizes role coverage, shared hours and goals for the whole team, not just people similar to you.",
            },
            {
              icon: ShieldCheck,
              title: "You stay in control",
              body: "Profiles are opt-in. AI never sends invites. A team forms only when people accept.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-card p-5">
              <Icon className="mb-3 size-5 text-primary" aria-hidden />
              <h2 className="font-medium">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        TrojanMatch is a student project and is not affiliated with or endorsed by USC.
      </footer>
    </div>
  );
}
