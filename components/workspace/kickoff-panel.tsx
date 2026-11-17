"use client";

import { useState } from "react";
import { AlertTriangle, CheckSquare, Info, Lightbulb, ListChecks, Loader2, Sparkles, Target, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Content = {
  goal_summary: string;
  project_ideas: { title: string; pitch: string; why_this_team: string; tech_approach: string }[];
  strengths: string[];
  gaps: string[];
  roles: { member_id: string; role: string; responsibilities: string }[];
  first_meeting_agenda: string[];
  first_actions: { action: string; owner_id: string | null }[];
  challenges: { risk: string; mitigation: string }[];
};
type Brief = { version: 1; source: "llm" | "template"; model: string | null; fallback_reason: string | null; content: Content };
type Record_ = { id: string; brief: unknown; source: "llm" | "template"; created_at: string };

const FALLBACK: Record<string, string> = {
  not_configured: "Gemini isn't configured on this server, so this kickoff was built from your team's data with a deterministic template.",
  timeout: "Gemini didn't answer in time, so this kickoff uses the deterministic template.",
  http: "Gemini was unavailable, so this kickoff uses the deterministic template.",
  blocked: "Gemini declined this request, so this kickoff uses the deterministic template.",
  invalid: "Gemini's answer didn't pass validation, so this kickoff uses the deterministic template.",
  demo_limit: "This demo sandbox has used its Gemini budget for now, so this kickoff was built from your team's data with the deterministic template.",
};

/**
 * AI Team Kickoff. Generated only on an explicit click; grounded in this team's
 * consented profiles and the deterministic team fit (shown separately, never
 * produced by the model). All text renders as plain text.
 */
export function KickoffPanel({
  teamId,
  initial,
  members,
  fit,
}: {
  teamId: string;
  initial: Record_ | null;
  members: { id: string; name: string }[];
  fit: { score: number; band: string; sharedHours: number };
}) {
  const [record, setRecord] = useState<Record_ | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const brief = (record?.brief ?? null) as Brief | null;
  const c = brief?.content;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ kickoff: Record_ }>(`/api/teams/${teamId}/kickoff`, { method: "POST", json: {} });
      setRecord(r.kickoff);
      toast.success("Kickoff ready. Roles are suggestions: agree on them together.");
    } catch (err) {
      setError((err as ApiClientError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="kickoff-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-4" data-testid="kickoff-panel">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="kickoff-heading" className="flex items-center gap-2 font-medium">
            <Sparkles className="size-4 text-primary" aria-hidden /> AI Team Kickoff
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Uses only your team&apos;s shared profiles and its TrojanMatch fit ({fit.band}, {fit.score.toFixed(2)} · {fit.sharedHours} h/week shared). Chat is never sent to the AI.
          </p>
        </div>
        <Button size="sm" onClick={generate} disabled={busy} variant={c ? "outline" : "default"}>
          {busy ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Sparkles data-icon="inline-start" aria-hidden />}
          {busy ? "Generating… (10–20 s)" : c ? "Regenerate" : "Generate kickoff"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="kickoff-error">{error}</p>
      )}

      {busy && (
        <div className="flex flex-col gap-2" role="status" data-testid="kickoff-generating">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Reading your team&apos;s shared profiles and fit, then drafting ideas, roles and a first-meeting plan…
          </p>
          {!c && [0, 1, 2].map((i) => <div key={i} aria-hidden className="h-14 animate-pulse rounded-lg bg-muted" />)}
        </div>
      )}

      {!c && !busy && (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground" data-testid="kickoff-empty">
          Generate project ideas, suggested roles, a first-meeting agenda and three first actions for your team.
        </p>
      )}

      {c && brief && (
        <div
          className={cn("flex flex-col gap-4 text-sm transition-opacity", busy && "pointer-events-none opacity-50")}
          aria-busy={busy}
          data-testid="kickoff-content"
          data-source={brief.source}
        >
          <p className="flex flex-wrap items-center gap-1.5 text-xs" data-testid="kickoff-source">
            {brief.source === "llm" ? (
              <Badge variant="outline" className="border-primary/40 bg-primary/10 font-normal text-primary">Generated by Gemini ({brief.model})</Badge>
            ) : (
              <Badge variant="outline" className="font-normal">Template (no AI)</Badge>
            )}
            <span className="text-muted-foreground">{new Date(record!.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </p>
          {brief.source === "template" && brief.fallback_reason && (
            <p className="flex gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {FALLBACK[brief.fallback_reason] ?? FALLBACK.http}
            </p>
          )}

          <Block icon={Target} title="Shared goal">
            <p>{c.goal_summary}</p>
          </Block>

          <Block icon={Lightbulb} title="Project ideas">
            <ol className="flex flex-col gap-2">
              {c.project_ideas.map((i) => (
                <li key={i.title} className="rounded-lg border p-3" data-testid="kickoff-idea">
                  <p className="font-medium">{i.title}</p>
                  <p className="mt-1">{i.pitch}</p>
                  {i.why_this_team && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Why this team:</span> {i.why_this_team}</p>}
                  {i.tech_approach && <p className="mt-1 text-xs text-muted-foreground"><span className="font-medium">Approach:</span> {i.tech_approach}</p>}
                </li>
              ))}
            </ol>
          </Block>

          {(c.strengths.length > 0 || c.gaps.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {c.strengths.length > 0 && <List title="Strengths" items={c.strengths} />}
              {c.gaps.length > 0 && <List title="Gaps" items={c.gaps} />}
            </div>
          )}

          <Block icon={Users} title="Suggested roles (not final)">
            <ul className="flex flex-col gap-1.5" data-testid="kickoff-roles">
              {c.roles.map((r) => (
                <li key={r.member_id}>
                  <span className="font-medium">{names.get(r.member_id) ?? "Member"}</span> · {r.role}
                  {r.responsibilities && <span className="block text-xs text-muted-foreground">{r.responsibilities}</span>}
                </li>
              ))}
            </ul>
          </Block>

          <Block icon={ListChecks} title="First meeting agenda">
            <ol className="list-decimal pl-5">
              {c.first_meeting_agenda.map((a) => <li key={a}>{a}</li>)}
            </ol>
          </Block>

          <Block icon={CheckSquare} title="First actions">
            <ol className="flex flex-col gap-1" data-testid="kickoff-actions">
              {c.first_actions.map((a) => (
                <li key={a.action} className="flex gap-2">
                  <span aria-hidden>☐</span>
                  <span>
                    {a.action}
                    {a.owner_id && names.get(a.owner_id) && <span className="text-xs text-muted-foreground"> · suggested: {names.get(a.owner_id)}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Block>

          {c.challenges.length > 0 && (
            <Block icon={AlertTriangle} title="Challenges & next steps">
              <ul className="flex flex-col gap-1.5">
                {c.challenges.map((x) => (
                  <li key={x.risk}>
                    <span className="font-medium">{x.risk}</span>
                    {x.mitigation && <span className="block text-xs text-muted-foreground">{x.mitigation}</span>}
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </div>
      )}
    </section>
  );
}

function Block({ icon: Icon, title, children }: { icon: typeof Target; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" aria-hidden /> {title}
      </h3>
      <div className="[overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="list-disc pl-4 [overflow-wrap:anywhere]">
        {items.map((s) => <li key={s}>{s}</li>)}
      </ul>
    </div>
  );
}
