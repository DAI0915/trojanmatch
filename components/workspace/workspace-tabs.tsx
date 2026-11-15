"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "chat", label: "Chat" },
  { key: "kickoff", label: "AI Kickoff" },
  { key: "team", label: "Team" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** Desktop: three columns. Mobile (<lg): tab switch between the same panels. */
export function WorkspaceTabs({ chat, kickoff, team }: { chat: React.ReactNode; kickoff: React.ReactNode; team: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("chat");
  return (
    <>
      <div role="tablist" aria-label="Workspace sections" className="mb-4 grid grid-cols-3 gap-1 rounded-lg border bg-card p-1 lg:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn("rounded-md px-2 py-1.5 text-sm", tab === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)_24rem]">
        <div className={cn(tab !== "team" && "hidden", "lg:block")}>{team}</div>
        <div className={cn(tab !== "chat" && "hidden", "lg:block")}>{chat}</div>
        <div className={cn(tab !== "kickoff" && "hidden", "lg:block lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto")}>{kickoff}</div>
      </div>
    </>
  );
}
