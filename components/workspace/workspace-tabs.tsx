"use client";

import { useRef, useState } from "react";
import { Info, MessageSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "chat", label: "Chat", short: "Chat", icon: MessageSquare },
  { key: "kickoff", label: "AI Kickoff", short: "AI Kickoff", icon: Sparkles },
  { key: "details", label: "Team details", short: "Details", icon: Info },
] as const;
type Tab = (typeof TABS)[number]["key"];

/**
 * Chat-first workspace. Desktop: a compact members sidebar (15–17rem) and the
 * main column (the rest) with tabs: Chat (default) · AI Kickoff · Team details.
 * Mobile: the same tabs; the members list shows under Team details.
 * Every panel stays mounted, so switching tabs keeps the live chat connection
 * and an unsent draft.
 */
export function WorkspaceTabs({
  sidebar,
  chat,
  kickoff,
  details,
}: {
  sidebar: React.ReactNode;
  chat: React.ReactNode;
  kickoff: React.ReactNode;
  details: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("chat");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: React.KeyboardEvent, i: number) {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const j = (next + TABS.length) % TABS.length;
    setTab(TABS[j].key);
    refs.current[j]?.focus();
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)]">
      <aside
        aria-label="Team members"
        className={cn("order-last lg:order-none lg:block", tab === "details" ? "block" : "hidden")}
        data-testid="workspace-sidebar"
      >
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-col gap-3">
        <div role="tablist" aria-label="Workspace sections" className="flex gap-1 border-b">
          {TABS.map((t, i) => (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`ws-tab-${t.key}`}
              role="tab"
              type="button"
              aria-label={t.label}
              aria-selected={tab === t.key}
              aria-controls={`ws-panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              onClick={() => setTab(t.key)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "-mb-px inline-flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:flex-none",
                tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="size-4 shrink-0" aria-hidden />
              <span className="whitespace-nowrap sm:hidden">{t.short}</span>
              <span className="hidden whitespace-nowrap sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <div id="ws-panel-chat" role="tabpanel" aria-labelledby="ws-tab-chat" hidden={tab !== "chat"}>
          {chat}
        </div>
        <div id="ws-panel-kickoff" role="tabpanel" aria-labelledby="ws-tab-kickoff" hidden={tab !== "kickoff"} className="max-w-4xl">
          {kickoff}
        </div>
        <div id="ws-panel-details" role="tabpanel" aria-labelledby="ws-tab-details" hidden={tab !== "details"} className="max-w-4xl">
          {details}
        </div>
      </div>
    </div>
  );
}
