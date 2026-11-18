"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Loader2, MessageSquare, RotateCw, Send, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Message = { id: string; author_id: string; body: string; client_id: string | null; created_at: string };
type Pending = { client_id: string; body: string; state: "sending" | "failed"; error?: string };
type Conn = "connecting" | "live" | "reconnecting";

const MAX = 2000;

function sortMerge(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || (a.id < b.id ? -1 : 1));
}

const timeFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const clockFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" });

/** "Today", "Yesterday" or "Monday, Nov 16" for the separators between days. */
function dayLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : dayFmt.format(d);
}

const STARTERS = [
  "Hi team! Excited to build this together 👋",
  "When can everyone meet this week?",
  "How should we split the roles?",
];

/**
 * Team chat. History is server-rendered; new messages arrive over Supabase
 * Realtime (Postgres changes, filtered by RLS per subscriber). Sends go through
 * /api (session-derived author, idempotent client_id). Bodies render as plain
 * text only (React escapes; no HTML/Markdown).
 */
export function TeamChat({
  teamId,
  meId,
  members,
  initial,
  othersNames = [],
}: {
  teamId: string;
  meId: string;
  members: { id: string; name: string }[];
  initial: Message[];
  /** Teammates other than the viewer, for the empty state. */
  othersNames?: string[];
}) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const [conn, setConn] = useState<Conn>("connecting");
  const [loadError, setLoadError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLElement>(null);
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Follow new messages only while the reader is at the bottom (don't yank them away from history).
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const add = useCallback((incoming: Message[]) => {
    setMessages((cur) => sortMerge(cur, incoming));
    const ids = new Set(incoming.map((m) => m.client_id).filter(Boolean));
    if (ids.size) setPending((p) => p.filter((x) => !ids.has(x.client_id)));
  }, []);

  // Fills any gap (e.g. after a reconnect) from the database.
  const refetch = useCallback(async () => {
    try {
      const r = await apiFetch<{ messages: Message[] }>(`/api/teams/${teamId}/messages`, { cache: "no-store" });
      add(r.messages);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as ApiClientError).message);
    }
  }, [add, teamId]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let everLive = false;
    const channel = supabase.channel(`team-chat:${teamId}`);
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `team_id=eq.${teamId}` }, (payload) => {
          add([payload.new as Message]);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            setConn("live");
            // First connect: the change feed needs a moment to register, so catch up once shortly after.
            // Reconnect: catch up on anything missed while offline.
            if (everLive) void refetch();
            else setTimeout(() => !cancelled && void refetch(), 2500);
            everLive = true;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setConn("reconnecting");
          }
        });
    })();
    const onOnline = () => void refetch();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      void supabase.removeChannel(channel);
    };
  }, [teamId, add, refetch]);

  const scrollToEnd = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setUnseen(0);
  }, []);

  // New messages: stay pinned to the newest one if the reader is at the bottom; otherwise count them.
  const lastCount = useRef(messages.length + pending.length);
  useEffect(() => {
    const total = messages.length + pending.length;
    const added = total - lastCount.current;
    lastCount.current = total;
    if (atBottom.current) scrollToEnd();
    else if (added > 0) setUnseen((n) => n + added);
  }, [messages.length, pending.length, scrollToEnd]);

  // The panel can be hidden (another tab) or resized; when it shows again, keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fill the screen below the panel so the composer always sits at the bottom of the viewport,
  // whatever is above it (demo bar, header). Falls back to the CSS height before hydration.
  useEffect(() => {
    const fit = () => {
      const el = boxRef.current;
      if (!el || el.offsetParent === null) return; // hidden tab: keep the last size
      const top = el.getBoundingClientRect().top + window.scrollY;
      const min = window.innerWidth >= 1024 ? 480 : 360;
      setFitHeight(Math.max(min, Math.floor(window.innerHeight - top - 16)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  function onScroll() {
    const el = listRef.current;
    if (!el || el.clientHeight === 0) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (atBottom.current) setUnseen(0);
  }

  async function send(body: string, clientId: string = crypto.randomUUID()) {
    const text = body.trim();
    if (!text) return;
    atBottom.current = true; // your own message always scrolls into view
    setPending((p) => [...p.filter((x) => x.client_id !== clientId), { client_id: clientId, body: text, state: "sending" }]);
    try {
      const r = await apiFetch<{ message: Message }>(`/api/teams/${teamId}/messages`, { method: "POST", json: { body: text, client_id: clientId } });
      add([r.message]);
    } catch (err) {
      const e = err as ApiClientError;
      setPending((p) => p.map((x) => (x.client_id === clientId ? { ...x, state: "failed", error: e.message } : x)));
    }
  }

  function submit() {
    if (!draft.trim() || draft.length > MAX) return;
    void send(draft);
    setDraft("");
  }

  const ConnIcon = conn === "live" ? Wifi : conn === "connecting" ? Loader2 : WifiOff;
  return (
    <section
      ref={boxRef}
      style={fitHeight ? { height: fitHeight } : undefined}
      aria-labelledby="chat-heading"
      className="relative flex h-[calc(100dvh-13rem)] min-h-[420px] flex-col overflow-hidden rounded-xl border bg-card lg:h-[calc(100dvh-15rem)] lg:min-h-[480px]"
      data-testid="team-chat"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <h2 id="chat-heading" className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="size-4 text-primary" aria-hidden /> Team chat
        </h2>
        <span
          data-testid="connection-status"
          data-state={conn}
          className={cn("flex items-center gap-1 text-xs", conn === "live" ? "text-primary" : "text-muted-foreground")}
          role="status"
        >
          <ConnIcon className={cn("size-3.5", conn === "connecting" && "animate-spin")} aria-hidden />
          {conn === "live" ? "Live" : conn === "connecting" ? "Connecting…" : "Reconnecting… messages still send"}
        </span>
      </header>

      <div
        ref={listRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto bg-muted/30 px-3 py-4 sm:px-5"
        aria-live="polite"
        aria-label="Messages"
        data-testid="chat-list"
      >
        {loadError && (
          <p role="alert" className="mb-2 flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
            <Button size="xs" variant="outline" onClick={() => void refetch()}>Retry</Button>
          </p>
        )}
        {messages.length === 0 && pending.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center text-sm" data-testid="chat-empty">
            {othersNames.length > 0 && (
              <span className="flex -space-x-2" aria-hidden>
                {othersNames.slice(0, 5).map((n) => (
                  <PersonAvatar key={n} name={n} className="ring-2 ring-background" />
                ))}
              </span>
            )}
            <div>
              <p className="text-base font-semibold text-foreground">Start the conversation</p>
              <p className="mt-1 max-w-sm text-muted-foreground">
                {othersNames.length > 0 ? `${listNames(othersNames)} ${othersNames.length === 1 ? "is" : "are"} on this team. ` : ""}
                Say hi, then agree on a first meeting time and who does what.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2" aria-label="Message ideas">
              {STARTERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setDraft(t);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((m, idx) => {
              const mine = m.author_id === meId;
              const author = mine ? "You" : (names.get(m.author_id) ?? "Former member");
              const prev = messages[idx - 1];
              const newDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
              // Consecutive messages from the same person within 5 minutes share one header.
              const grouped =
                !newDay && !!prev && prev.author_id === m.author_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
              return (
                <Fragment key={m.id}>
                {newDay && (
                  <li role="separator" className="my-1 flex items-center gap-3 text-xs text-muted-foreground" data-testid="chat-day">
                    <span className="h-px flex-1 bg-border" aria-hidden />
                    {dayLabel(m.created_at)}
                    <span className="h-px flex-1 bg-border" aria-hidden />
                  </li>
                )}
                <li
                  className={cn("flex gap-2", mine ? "flex-row-reverse" : "flex-row", grouped && "-mt-2")}
                  data-testid="chat-message"
                  data-mine={mine}
                >
                  {!mine && (grouped ? <span className="w-7 shrink-0" aria-hidden /> : <PersonAvatar name={names.get(m.author_id)} size="sm" className="mt-4" />)}
                  <div className={cn("flex min-w-0 max-w-[80%] flex-col sm:max-w-[70%]", mine ? "items-end" : "items-start")}>
                    <span className={cn("mb-0.5 text-xs text-muted-foreground", grouped && "sr-only")}>
                      <span className="font-medium text-foreground" data-testid="chat-author">{author}</span>
                      {" · "}
                      <time dateTime={m.created_at}>{clockFmt.format(new Date(m.created_at))}</time>
                    </span>
                    <p
                      data-testid="chat-body"
                      title={timeFmt.format(new Date(m.created_at))}
                      className={cn(
                        "whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere]",
                        mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-card shadow-xs",
                      )}
                    >
                      {m.body}
                    </p>
                  </div>
                </li>
                </Fragment>
              );
            })}
            {pending.map((p) => (
              <li key={p.client_id} className="flex flex-col items-end" data-testid="chat-pending" data-state={p.state}>
                <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary/60 sm:max-w-[70%] px-3 py-2 text-sm text-primary-foreground [overflow-wrap:anywhere]">{p.body}</p>
                {p.state === "sending" ? (
                  <span className="mt-0.5 text-xs text-muted-foreground">Sending…</span>
                ) : (
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-destructive" role="alert">
                    Not sent{p.error ? `: ${p.error}` : ""}
                    <Button size="xs" variant="outline" onClick={() => void send(p.body, p.client_id)}>
                      <RotateCw data-icon="inline-start" aria-hidden /> Retry
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {unseen > 0 && (
        <button
          type="button"
          onClick={scrollToEnd}
          className="absolute bottom-20 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-md"
          data-testid="chat-jump"
        >
          <ArrowDown className="size-3.5" aria-hidden /> {unseen} new message{unseen === 1 ? "" : "s"}
        </button>
      )}

      <form
        data-toast-avoid
        className="flex items-end gap-2 border-t bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex-1">
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <Textarea
            ref={inputRef}
            id="chat-input"
            data-testid="chat-input"
            rows={1}
            maxLength={MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Message your team…"
            aria-describedby="chat-hint"
            className="max-h-40 min-h-10 rounded-2xl px-4 py-2.5"
          />
          <p id="chat-hint" className="sr-only">Enter sends. Shift+Enter adds a new line.</p>
          {draft.length > MAX - 200 && <p className="mt-1 text-right text-xs text-muted-foreground">{draft.length}/{MAX}</p>}
        </div>
        <Button type="submit" size="icon-lg" className="rounded-full" disabled={!draft.trim()} aria-label="Send message">
          <Send aria-hidden />
        </Button>
      </form>
    </section>
  );
}

/** "Kai", "Kai and Maya", "Kai, Maya and Priya", "Kai, Maya and 3 others". */
function listNames(names: string[]) {
  const first = names.map((n) => n.split(" ")[0]);
  if (first.length <= 1) return first.join("");
  if (first.length <= 3) return `${first.slice(0, -1).join(", ")} and ${first.at(-1)}`;
  return `${first.slice(0, 2).join(", ")} and ${first.length - 2} others`;
}
