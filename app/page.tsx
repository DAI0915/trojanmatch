import Link from "next/link";
import { ArrowRight, Landmark, ShieldCheck, Sparkles, UsersRound, Video, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { DemoStartProvider } from "@/components/demo/demo-start";
import { DemoStartHint, HeaderDemoButton, TryDemoButton } from "@/components/demo/try-demo-button";
import { ProductShowcase } from "@/components/landing/product-showcase";
import { DEMO_VIDEO_URL } from "@/lib/demo/links";
import { getCurrentUser } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const BENEFITS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Landmark, title: "Built for USC students", body: "Hackathons & course projects" },
  { icon: UsersRound, title: "Whole-team matching", body: "Optimizes roles, skills and availability" },
  { icon: ShieldCheck, title: "Private demo sandbox", body: "Try it safely with synthetic data" },
  { icon: Sparkles, title: "AI team kickoff", body: "Turn ideas into a plan, faster" },
];

const container = "mx-auto w-full max-w-[1600px] px-4 sm:px-8 xl:px-16 2xl:px-20 3xl:max-w-[1760px]";

export default async function LandingPage() {
  const { user } = await getCurrentUser();

  const page = (
    <div className="relative isolate flex min-h-full flex-1 flex-col overflow-x-clip bg-white">
      {/* Soft pale-pink washes behind everything. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_88%_8%,rgb(153_0_0/0.07),transparent_72%),radial-gradient(45%_40%_at_0%_100%,rgb(153_0_0/0.06),transparent_70%),linear-gradient(160deg,rgb(153_0_0/0.035),transparent_45%,rgb(153_0_0/0.04)_80%,transparent)]"
      />

      <header className={cn(container, "flex h-16 shrink-0 items-center justify-between gap-2 sm:h-20 3xl:h-24")}>
        <Logo size="lg" />
        <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-2 lg:gap-3">
          <ul className="mr-2 hidden items-center gap-1 lg:flex xl:mr-4 xl:gap-4">
            <li>
              <a href="#features" className="rounded-md px-3 py-2 text-[0.95rem] font-medium 3xl:text-base text-foreground/85 hover:text-foreground">
                Features
              </a>
            </li>
            <li>
              <Link href="/demo" className="rounded-md px-3 py-2 text-[0.95rem] font-medium 3xl:text-base text-foreground/85 hover:text-foreground">
                How it works
              </Link>
            </li>
            <li>
              <a
                href={DEMO_VIDEO_URL}
                target="_blank"
                rel="noreferrer"
                className="rounded-md px-3 py-2 text-[0.95rem] font-medium 3xl:text-base text-foreground/85 hover:text-foreground"
              >
                Demo<span className="sr-only"> video (opens in a new tab)</span>
              </a>
            </li>
          </ul>
          {user ? (
            <Link href="/spaces" className={cn(buttonVariants(), "h-10 px-4 text-[0.95rem] sm:h-11 sm:px-5")}>
              Open app <ArrowRight data-icon="inline-end" aria-hidden />
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className={buttonVariants({ variant: "ghost", className: "h-10 px-2 text-[0.95rem] sm:h-11 sm:px-3" })}>
                Sign in
              </Link>
              <HeaderDemoButton className="h-10 px-3 text-[0.95rem] shadow-sm sm:h-11 sm:px-5 3xl:h-12 3xl:px-6 3xl:text-base" />
            </>
          )}
        </nav>
      </header>

      <main className="flex flex-1 flex-col lg:justify-center">
        <section
          aria-labelledby="hero-heading"
          className={cn(
            container,
            "grid items-center gap-x-8 gap-y-10 pb-10 pt-6 sm:pt-12 lg:grid-cols-[minmax(0,38fr)_minmax(0,62fr)] lg:pb-[clamp(2.5rem,8vh,6rem)] lg:pt-[clamp(1.5rem,3.5vh,3rem)] xl:gap-x-10 2xl:grid-cols-[minmax(0,36fr)_minmax(0,64fr)] 3xl:grid-cols-[minmax(0,37fr)_minmax(0,63fr)]",
          )}
        >
          <div className="flex flex-col items-start">
            <p className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/80 px-3 py-1.5 text-[0.78rem] text-foreground/75 shadow-xs sm:px-4 sm:text-[0.95rem] 3xl:px-5 3xl:py-2 3xl:text-base">
              <span className="size-2.5 rounded-full bg-brand-gold" aria-hidden />
              For USC students · Hackathons &amp; course projects
            </p>
            <h1
              id="hero-heading"
              className="mt-7 text-[clamp(2.6rem,10.5vw,3.5rem)] font-bold leading-[1.04] tracking-[-0.035em] text-neutral-950 sm:text-6xl lg:mt-9 lg:text-[clamp(3.25rem,4.45vw,4.4rem)] 3xl:mt-10 3xl:text-[4.875rem]"
            >
              Stop searching.
              <br />
              <span className="text-primary">Start building.</span>
            </h1>
            <p className="mt-6 max-w-[36rem] text-lg leading-relaxed text-neutral-600 lg:mt-7 lg:text-[1.0625rem] 2xl:text-[1.2rem] 3xl:mt-8 3xl:max-w-[38rem] 3xl:text-[1.3rem]">
              TrojanMatch helps students find compatible teammates, build complete teams, and start collaborating
              immediately for hackathons and course projects.
            </p>
            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-start lg:mt-10 3xl:mt-11">
              {user ? (
                <Link href="/spaces" className={cn(buttonVariants({ size: "lg" }), "h-12 px-6 text-base shadow-sm 3xl:h-14 3xl:px-8 3xl:text-lg")}>
                  Open app <ArrowRight data-icon="inline-end" aria-hidden />
                </Link>
              ) : (
                <TryDemoButton className="h-12 px-6 text-base shadow-[0_8px_20px_-8px_rgb(153_0_0/0.55)] 3xl:h-14 3xl:px-8 3xl:text-lg" />
              )}
              <a
                href={DEMO_VIDEO_URL}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 bg-white px-6 text-base shadow-xs 3xl:h-14 3xl:px-8 3xl:text-lg")}
              >
                <Video data-icon="inline-start" aria-hidden /> Watch 3-min demo
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
            {!user && (
              <DemoStartHint className="mt-3 text-sm text-neutral-500 3xl:text-base">
                No sign-up needed. Private sandbox with synthetic students.
              </DemoStartHint>
            )}
          </div>

          <ProductShowcase className="mx-auto max-w-[44rem] lg:-mr-2 lg:max-w-none xl:-mr-8 2xl:-mr-12" />
        </section>

        <section id="features" aria-label="Why TrojanMatch" className={cn(container, "scroll-mt-6 pb-10 lg:pb-6")}>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-5 border-t border-black/[0.06] pt-8 sm:grid-cols-2 sm:gap-y-7 lg:gap-x-10 xl:flex xl:justify-between xl:gap-0 xl:border-t-0 xl:pt-2">
            {BENEFITS.map(({ icon: Icon, title, body }, i) => (
              <li
                key={title}
                className={cn(
                  "flex items-center gap-4 xl:gap-5 xl:px-6 xl:first:pl-0 xl:last:pr-0 2xl:px-10",
                  i > 0 && "xl:border-l xl:border-black/[0.09]",
                )}
              >
                <Icon className="size-8 shrink-0 text-primary xl:size-10 3xl:size-11" strokeWidth={1.6} aria-hidden />
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-neutral-900 2xl:text-lg 3xl:text-xl">{title}</h2>
                  <p className="whitespace-nowrap text-sm text-neutral-500 2xl:text-base 3xl:text-[1.0625rem]">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-black/[0.06] px-4 py-4 text-center text-xs text-muted-foreground">
        TrojanMatch is a student project and is not affiliated with or endorsed by USC.
      </footer>
    </div>
  );

  return user ? page : <DemoStartProvider>{page}</DemoStartProvider>;
}
