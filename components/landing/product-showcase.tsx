import { ArrowRight, CalendarClock, Compass, Inbox, Search, SendHorizontal, Sparkles, Trophy, UserPlus, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import { HelmetMark } from "@/components/brand/helmet-mark";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { cn } from "@/lib/utils";

/*
 * Landing-page product showcase: three overlapping, upright windows rendered in
 * HTML/CSS from the real TrojanMatch UI (same copy, colors and components as the
 * app), filled with the demo sandbox's synthetic data:
 *   front  - Discover for "AI@USC Hackathon 2026" (32 participants · 4 teams recruiting)
 *   middle - a team workspace (Chat · AI Kickoff · Team details)
 *   back   - the Smart Team recommendation the demo produces for Jordan Lee
 *            (Team Fit: Strong; Daniel Cohen, Kai Nakamura, Marcus Johnson)
 * Everything is sized in `em` off a font-size derived from the container width
 * (container query units), so the composition scales as one piece without
 * transforms or distortion. Three arrangements:
 *   < 520px   Discover only (no sidebar), the workspace peeking out behind it
 *   520-719px Discover + workspace
 *   >= 720px  all three windows
 * It is a picture of the product: one accessible description, no focusable parts.
 */

const windowChrome =
  "overflow-hidden rounded-[0.85em] border border-black/[0.07] bg-white shadow-[0_1.6em_3.2em_-1.2em_rgba(90,0,0,0.22),0_0.25em_0.8em_-0.2em_rgba(0,0,0,0.08)]";

function MiniLogo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-[0.4em] font-semibold tracking-tight", className)}>
      <HelmetMark className="size-[1.5em]" />
      <span>
        Trojan<span className="text-primary">Match</span>
      </span>
    </span>
  );
}

const NAV: { label: string; icon: LucideIcon; active?: boolean }[] = [
  { label: "Discover", icon: Compass, active: true },
  { label: "Smart Match", icon: Sparkles },
  { label: "My Teams", icon: UsersRound },
  { label: "Invitations", icon: Inbox },
  { label: "Profile", icon: UserRound },
];

const ACTIONS: { icon: LucideIcon; title: string; body: string; cta: string }[] = [
  { icon: Sparkles, title: "Smart Team Formation", body: "Get a complete team recommendation based on skills, goals, and availability.", cta: "Build My Team" },
  { icon: Search, title: "Find a Team", body: "Browse recruiting teams and request to join.", cta: "Find a Team" },
  { icon: UserPlus, title: "Grow My Team", body: "Find teammates who fill the missing roles in your team.", cta: "Grow My Team" },
];

function DiscoverWindow({ className }: { className?: string }) {
  return (
    <div className={cn(windowChrome, "flex", className)} data-window="discover">
      <div className="hidden w-[10.5em] shrink-0 flex-col border-r border-black/[0.06] bg-[#fcfcfc] px-[0.9em] py-[1.2em] @min-[520px]:flex">
        <MiniLogo className="px-[0.3em] text-[0.95em]" />
        <ul className="mt-[2.1em] flex flex-col gap-[0.55em] text-[0.8em]">
          {NAV.map(({ label, icon: Icon, active }) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-[0.75em] rounded-[0.6em] px-[0.8em] py-[0.75em]",
                active ? "bg-primary/10 font-medium text-primary" : "text-neutral-600",
              )}
            >
              <Icon className="size-[1.15em]" />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-[1.2em] pb-[1.3em] pt-[1.1em] @min-[520px]:px-[1.4em] @min-[520px]:pb-[1.2em] @min-[520px]:pt-[3.1em]">
        <MiniLogo className="mb-[1.1em] text-[0.9em] @min-[520px]:hidden" />
        <div className="flex items-center gap-[0.8em]">
          <Trophy className="size-[2.2em] shrink-0 text-[#f2b705]" strokeWidth={1.8} />
          <div className="min-w-0">
            <p className="truncate text-[1.4em] font-semibold leading-tight tracking-tight text-neutral-900">AI@USC Hackathon 2026</p>
            <p className="mt-[0.3em] text-[0.78em] text-neutral-500">32 participants · 4 teams recruiting</p>
          </div>
        </div>
        <ul className="mt-[1.3em] flex flex-col gap-[0.7em] @min-[520px]:mt-[1.7em]">
          {ACTIONS.map(({ icon: Icon, title, body, cta }) => (
            <li
              key={title}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-[0.9em] gap-y-[0.6em] rounded-[0.8em] border border-primary/30 bg-white p-[0.85em] shadow-[0_0.1em_0.3em_rgba(0,0,0,0.05)] @min-[520px]:min-h-[5.3em] @min-[520px]:grid-cols-[auto_minmax(0,1fr)_auto]"
            >
              <span className="flex size-[3em] items-center justify-center rounded-[0.65em] bg-primary text-white">
                <Icon className="size-[1.35em]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.98em] font-semibold leading-tight text-neutral-900">{title}</span>
                <span className="mt-[0.3em] block text-[0.72em] leading-snug text-neutral-500">{body}</span>
              </span>
              <span className="col-span-2 inline-flex items-center gap-[0.35em] justify-self-start whitespace-nowrap rounded-[0.45em] bg-primary px-[0.9em] py-[0.55em] text-[0.7em] font-medium text-white @min-[520px]:col-span-1">
                {cta}
                <ArrowRight className="size-[1.1em]" />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const MESSAGES: { name: string; time: string; body: string; mine?: boolean }[] = [
  { name: "Daniel Cohen", time: "10:24 AM", body: "Should we use an LLM for the prototype?" },
  { name: "Kai Nakamura", time: "10:26 AM", body: "Yes! I'll sketch the main screens tonight." },
  { name: "Jordan Lee", time: "10:27 AM", body: "Great. I'll set up the API today.", mine: true },
];

function WorkspaceWindow({ className }: { className?: string }) {
  return (
    <div className={cn(windowChrome, "flex", className)} data-window="workspace">
      {/* Left strip: mostly hidden behind the Discover window, only the logo shows above it. */}
      <div className="hidden w-[9.6em] shrink-0 px-[1em] pt-[1.05em] @min-[520px]:block">
        <MiniLogo className="text-[0.8em]" />
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col px-[1em] pt-[1em] *:shrink-0 @min-[520px]:pt-[3.9em]">
        <p className="truncate text-[0.9em] font-semibold text-neutral-900">Workspace · Trojan Builders</p>
        <div className="mt-[0.9em] flex gap-[0.3em] text-[0.7em]">
          <span className="rounded-[0.5em] bg-primary/10 px-[0.8em] py-[0.45em] font-medium text-primary">Chat</span>
          <span className="px-[0.6em] py-[0.45em] text-neutral-600">AI Kickoff</span>
          <span className="px-[0.6em] py-[0.45em] text-neutral-600">Team details</span>
        </div>
        {/* The demo has no stored chat: these lines are examples, and labeled as such. */}
        <p className="mt-[1em] flex items-center gap-[0.6em] whitespace-nowrap text-[0.64em] font-medium text-neutral-500">
          <span className="h-px flex-1 bg-black/[0.08]" />
          Example messages · synthetic demo
          <span className="h-px flex-1 bg-black/[0.08]" />
        </p>
        <ul className="mt-[1em] flex flex-col gap-[1.1em]">
          {MESSAGES.map((m) =>
            m.mine ? (
              <li key={m.body} className="flex flex-col items-end">
                <span className="text-[0.64em] text-neutral-500">{m.time}</span>
                <span className="mt-[0.3em] max-w-[85%] rounded-[1em] rounded-br-[0.35em] bg-primary px-[0.8em] py-[0.5em] text-[0.74em] text-white">
                  {m.body}
                </span>
              </li>
            ) : (
              <li key={m.body} className="flex gap-[0.6em]">
                <PersonAvatar name={m.name} className="size-[2.5em] text-[0.68em]" />
                <div className="min-w-0">
                  <p className="text-[0.66em] text-neutral-500">
                    <span className="font-semibold text-neutral-900">{m.name}</span> · {m.time}
                  </p>
                  <p className="mt-[0.3em] rounded-[1em] rounded-bl-[0.35em] border border-black/[0.07] bg-white px-[0.8em] py-[0.5em] text-[0.74em] text-neutral-800 shadow-[0_0.05em_0.15em_rgba(0,0,0,0.04)]">
                    {m.body}
                  </p>
                </div>
              </li>
            ),
          )}
        </ul>
        <div className="absolute inset-x-[1em] bottom-[1em] flex items-center gap-[0.5em]">
          <span className="min-w-0 flex-1 truncate rounded-full border border-black/10 px-[1em] py-[0.6em] text-[0.66em] text-neutral-400">
            Message your team…
          </span>
          <span className="flex size-[2em] shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <SendHorizontal className="size-[1em]" />
          </span>
        </div>
      </div>
    </div>
  );
}

const TEAM: { name: string; role: string; you?: boolean }[] = [
  { name: "Jordan Lee", role: "Backend", you: true },
  { name: "Daniel Cohen", role: "AI / ML" },
  { name: "Kai Nakamura", role: "Design" },
  { name: "Marcus Johnson", role: "Frontend" },
];

function RecommendationWindow({ className }: { className?: string }) {
  return (
    <div className={cn(windowChrome, "pl-[2.9em] pr-[1.1em] pt-[1.05em]", className)} data-window="recommendation">
      <MiniLogo className="text-[0.8em]" />
      <p className="mt-[2em] text-[1em] font-semibold text-neutral-900">Recommended team</p>
      <span className="mt-[0.6em] inline-block rounded-full border border-primary/40 bg-primary/10 px-[0.8em] py-[0.3em] text-[0.68em] font-semibold text-primary">
        Team Fit: Strong
      </span>
      <ul className="mt-[1.3em] flex flex-col gap-[1em]">
        {TEAM.map((p) => (
          <li key={p.name} className="flex items-center gap-[0.6em]">
            <PersonAvatar name={p.name} className="size-[2.5em] text-[0.68em]" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[0.76em] font-semibold text-neutral-900">
                {p.name}
                {p.you && <span className="ml-[0.4em] font-normal text-neutral-500">(you)</span>}
              </p>
              <p className="text-[0.68em] text-primary">{p.role}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-[1.2em] flex items-start gap-[0.4em] border-t border-black/[0.06] pt-[0.9em] text-[0.66em] leading-snug text-neutral-600">
        <CalendarClock className="mt-[0.1em] size-[1.2em] shrink-0 text-primary" />
        20 h/week when everyone is free
      </p>
      <p className="mt-[0.5em] text-[0.62em] text-neutral-500">4 of 4 roles covered · synthetic demo data</p>
    </div>
  );
}

export function ProductShowcase({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="TrojanMatch preview with synthetic demo data: the Discover page for AI@USC Hackathon 2026 with Smart Team Formation, Find a Team and Grow My Team; a team workspace chat with example messages; and a recommended four-person team rated Team Fit: Strong."
      className={cn("@container w-full", className)}
      data-testid="product-showcase"
    >
      <div aria-hidden className="relative select-none pt-[3.3em] text-[calc(100cqw/26)] @min-[520px]:h-[32em] @min-[520px]:pt-0 @min-[520px]:text-[calc(100cqw/58)] @min-[720px]:text-[calc(100cqw/72)]">
        <RecommendationWindow className="absolute left-[56em] top-[2.9em] z-0 hidden h-[25.4em] w-[16em] @min-[720px]:block" />
        <WorkspaceWindow className="absolute left-[16%] right-[3%] top-0 z-10 h-[8em] @min-[520px]:left-[33.25em] @min-[520px]:right-auto @min-[520px]:h-[30.5em] @min-[520px]:w-[24.75em]" />
        <DiscoverWindow className="relative z-20 @min-[520px]:absolute @min-[520px]:left-0 @min-[520px]:top-[4.1em] @min-[520px]:h-[27.9em] @min-[520px]:w-[42.5em]" />
      </div>
    </div>
  );
}
