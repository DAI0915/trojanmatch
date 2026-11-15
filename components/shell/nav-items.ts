import { Compass, Inbox, Sparkles, UserRound, UsersRound } from "lucide-react";

/** Primary navigation (spec §2). Space-scoped items resolve against the current Space. */
export const NAV_ITEMS = [
  { key: "discover", label: "Discover", icon: Compass, spaceScoped: true, path: "discover", available: true },
  { key: "smart", label: "Smart Match", icon: Sparkles, spaceScoped: true, path: "smart", available: true },
  { key: "teams", label: "My Teams", icon: UsersRound, spaceScoped: false, path: "/teams", available: true },
  { key: "invitations", label: "Invitations", icon: Inbox, spaceScoped: false, path: "/invitations", available: true },
  { key: "profile", label: "Profile", icon: UserRound, spaceScoped: false, path: "/profile", available: true },
] as const;

export type ShellSpace = { id: string; slug: string; title: string; type: "hackathon" | "course" };

/** The current Space is derived from the URL (/s/[slug]/...), never from client state. */
export function currentSlug(pathname: string): string | null {
  const m = /^\/s\/([a-z0-9-]+)(?:\/|$)/.exec(pathname);
  return m ? m[1] : null;
}

export function hrefFor(item: (typeof NAV_ITEMS)[number], slug: string | null): string {
  if (!item.spaceScoped) return item.path;
  return slug ? `/s/${slug}/${item.path}` : "/spaces";
}
