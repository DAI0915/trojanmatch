"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Inbox, MessagesSquare, Repeat2, Sparkles, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STEPS = [
  {
    icon: Trophy,
    title: "Open a Matching Space",
    body: "Jordan has already joined AI@USC Hackathon 2026, a Space with 32 synthetic students.",
    href: "/spaces?type=hackathon&q=AI%40USC",
    cta: "Find the Space",
  },
  {
    icon: Sparkles,
    title: "Generate a Smart Team",
    body: "Open Smart Match → Generate recommended team. Every possible team is scored deterministically, then expand “Compare with simple individual ranking”.",
  },
  {
    icon: Repeat2,
    title: "Replace and invite",
    body: "Use Replace to swap a candidate (try Maya Chen or Priya Raman), then Send invitations. Nothing is sent until you confirm.",
  },
  {
    icon: Inbox,
    title: "Accept as a teammate",
    body: "In the yellow demo bar, choose Switch persona and pick someone you invited. Accept in Invitations; the team turns Active when everyone answers.",
  },
  {
    icon: MessagesSquare,
    title: "Workspace & AI Kickoff",
    body: "Open the team workspace for real-time chat, then Generate kickoff for Gemini’s project ideas and first steps.",
  },
] as const;

/** Optional 5-step guide. Opens once after a new demo starts (?welcome=1) or from the demo bar. */
export function DemoGuide() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("welcome") === "1") {
      url.searchParams.delete("welcome");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      // Deferred so the dialog opens after hydration without a cascading render.
      const t = window.setTimeout(() => setOpen(true), 0);
      return () => window.clearTimeout(t);
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <BookOpen className="size-3.5" aria-hidden /> Guide
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="demo-guide">
          <DialogHeader>
            <DialogTitle>Welcome to your private demo</DialogTitle>
            <DialogDescription>
              You’re Jordan Lee, a synthetic student. This sandbox is yours alone: other visitors can’t see or reset it.
              Five steps, about three minutes:
            </DialogDescription>
          </DialogHeader>
          <ol className="flex flex-col gap-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium">
                    <s.icon className="size-3.5 text-primary" aria-hidden /> {s.title}
                  </p>
                  <p className="text-muted-foreground">{s.body}</p>
                  {"href" in s && (
                    <Link href={s.href} onClick={() => setOpen(false)} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-2 hover:underline">
                      {s.cta} <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Start exploring</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
