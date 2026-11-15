"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageSquare, RotateCw, Send, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}: {
  teamId: string;
  meId: string;
  members: { id: string; name: string }[];
  initial: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initial);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const [conn, setConn] = useState<Conn>("connecting");
  const [loadError, setLoadError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending.length]);

  async function send(body: string, clientId: string = crypto.randomUUID()) {
    const text = body.trim();
    if (!text) return;
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
    <section aria-labelledby="chat-heading" className="flex h-[70dvh] min-h-[420px] flex-col rounded-xl border bg-card lg:h-[calc(100dvh-14rem)]">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 id="chat-heading" className="flex items-center gap-2 font-medium">
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

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3" aria-live="polite" aria-label="Messages" data-testid="chat-list">
        {loadError && (
          <p role="alert" className="mb-2 flex items-center justify-between gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
            <Button size="xs" variant="outline" onClick={() => void refetch()}>Retry</Button>
          </p>
        )}
        {messages.length === 0 && pending.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground" data-testid="chat-empty">
            <MessageSquare className="mb-2 size-6" aria-hidden />
            <p className="font-medium text-foreground">No messages yet</p>
            <p>Say hi and agree on your first meeting time.</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {messages.map((m) => {
              const mine = m.author_id === meId;
              return (
                <li key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")} data-testid="chat-message" data-mine={mine}>
                  <span className="mb-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground" data-testid="chat-author">{mine ? "You" : (names.get(m.author_id) ?? "Former member")}</span>
                    {" · "}
                    <time dateTime={m.created_at}>{timeFmt.format(new Date(m.created_at))}</time>
                  </span>
                  <p
                    data-testid="chat-body"
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere]",
                      mine ? "bg-primary text-primary-foreground" : "bg-muted",
                    )}
                  >
                    {m.body}
                  </p>
                </li>
              );
            })}
            {pending.map((p) => (
              <li key={p.client_id} className="flex flex-col items-end" data-testid="chat-pending" data-state={p.state}>
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary/60 px-3 py-2 text-sm text-primary-foreground [overflow-wrap:anywhere]">{p.body}</p>
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

      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex-1">
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <Textarea
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
            placeholder="Message your team (Enter to send, Shift+Enter for a new line)"
            className="max-h-40"
          />
          {draft.length > MAX - 200 && <p className="mt-1 text-right text-xs text-muted-foreground">{draft.length}/{MAX}</p>}
        </div>
        <Button type="submit" disabled={!draft.trim()} aria-label="Send message">
          <Send aria-hidden />
        </Button>
      </form>
    </section>
  );
}
