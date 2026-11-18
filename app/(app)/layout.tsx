import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { DemoBanner } from "@/components/demo/demo-banner";
import { AppNav } from "@/components/shell/app-nav";
import { MobileNav } from "@/components/shell/mobile-nav";
import { SpaceSwitcher } from "@/components/shell/space-switcher";
import { UserMenu } from "@/components/shell/user-menu";
import type { ShellSpace } from "@/components/shell/nav-items";
import { demoSwitchContext } from "@/lib/demo/switch-context";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user } = await getCurrentUser();
  // Defense in depth: proxy.ts already redirects, but never rely on it alone.
  if (!user) redirect("/sign-in");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("display_name, is_synthetic, scope").eq("id", user.id).maybeSingle(),
    supabase
      .from("participations")
      .select("space:matching_spaces(id, slug, title, type)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  // Demo only: who the visitor can switch to. Computed with the caller's own
  // RLS-bound client (no service role): pending invitations their team sent,
  // their teammates, and invitations waiting for them. The full directory is the
  // static synthetic fixture.
  const isDemo = !!profile?.scope?.startsWith("demo:");
  const switchCtx = isDemo && profile ? await demoSwitchContext(supabase, user.id, user.email, profile.display_name) : null;

  const spaces: ShellSpace[] = (memberships ?? [])
    .map((m) => m.space)
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 lg:flex">
        <Logo href="/spaces" />
        <AppNav />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {switchCtx && (
          <DemoBanner ctx={switchCtx} />
        )}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <MobileNav />
          <div className="min-w-0 flex-1">
            <SpaceSwitcher spaces={spaces} />
          </div>
          <UserMenu name={profile?.display_name ?? "Student"} synthetic={profile?.is_synthetic ?? false} />
        </header>
        {/* The team workspace opts into a wide layout (data-wide-page); every other page keeps max-w-5xl. */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8 has-[[data-wide-page]]:max-w-[1600px] lg:has-[[data-wide-page]]:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
