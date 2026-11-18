"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowLeft, CalendarDays, Check, Loader2, RefreshCw, Send, SlidersHorizontal, Sparkles, Target, Trophy, UsersRound, X, Zap,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { inputClass } from "@/components/forms/field";
import { ApiClientError, apiFetch } from "@/lib/api/client";
import type { FormResponse, ReplaceResponse } from "@/lib/matching/service";
import type { TeamView } from "@/lib/matching/view";
import { matchLabel, teamSummary, whyThisTeam, type Tone, type WhyCard } from "@/lib/matching/why";
import { cn } from "@/lib/utils";
import { DeltaChip } from "./fit";
import { DetailedAnalysis, type Change } from "./detailed-analysis";
import { FormationSettings, type Prefs } from "./formation-settings";
import { StepIndicator } from "./step-indicator";
import { TeamMemberCard } from "./team-member-card";

type Preset = { key: string; label: string };
type View = "settings" | "review";
type Saved = {
  v: 1;
  at: number;
  view: View;
  prefs: Prefs;
  excluded: { id: string; name: string }[];
  result: FormResponse | null;
  option: number;
  current: TeamView | null;
  change: Change | null;
  deselected: string[];
};

/** A generated (never sent) recommendation survives normal navigation for this long, in this tab only. */
const KEEP_MS = 30 * 60_000;

const BAND_PILL: Record<TeamView["band"], { className: string; icon: LucideIcon }> = {
  Strong: { className: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900", icon: Trophy },
  Good: { className: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900", icon: Check },
  Fair: { className: "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-900", icon: AlertTriangle },
  Weak: { className: "bg-muted text-muted-foreground ring-border", icon: AlertTriangle },
};

const noSubscribe = () => () => {};

function readStored(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function parseSaved(raw: string): Saved | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Saved;
    return s && s.v === 1 && Date.now() - s.at < KEEP_MS ? s : null;
  } catch {
    return null;
  }
}

const WHY_ICON: Record<WhyCard["key"], LucideIcon> = { skills: Zap, goals: Target, schedule: CalendarDays };
const TONE_TEXT: Record<Tone, string> = { good: "Strength", mixed: "Partly", weak: "Weak spot" };

export function SmartFormation({
  spaceId,
  slug,
  spaceTitle,
  viewerId,
  minSize,
  maxSize,
  presets,
  defaultPreset,
  team,
  eligibility,
}: {
  spaceId: string;
  slug: string;
  spaceTitle: string;
  viewerId: string;
  minSize: number;
  maxSize: number;
  presets: Preset[];
  defaultPreset: string;
  team: { id: string; name: string; members: number; targetSize: number } | null;
  /** Server-rendered "who can be matched" panel, shown (collapsed) with the preferences. */
  eligibility?: React.ReactNode;
}) {
  const sizes = Array.from({ length: Math.max(maxSize - Math.max(minSize, 2) + 1, 1) }, (_, i) => Math.max(minSize, 2) + i);
  const [prefs, setPrefs] = useState<Prefs>({
    teamSize: Math.min(Math.max(4, sizes[0]), sizes[sizes.length - 1]),
    preset: defaultPreset,
    mustRoles: [],
    minHours: "",
    strict: false,
  });
  const [excluded, setExcluded] = useState<{ id: string; name: string }[]>([]);
  const [view, setView] = useState<View>("settings");

  const [result, setResult] = useState<FormResponse | null>(null);
  const [option, setOption] = useState(0);
  const [current, setCurrent] = useState<TeamView | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [loading, setLoading] = useState(false);
  const [replace, setReplace] = useState<ReplaceResponse | null>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const router = useRouter();
  // Invitations are only ever sent from this explicit selection + confirmation.
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef(false);
  const sent = useRef(false);
  const storageKey = `tm:smart:v1:${spaceId}:${viewerId}:${team?.id ?? "new"}`;

  // Restore this tab's unsent recommendation (and preferences) after navigating away and back.
  // The server render has nothing stored (undefined); the client reads sessionStorage once per key.
  const stored = useSyncExternalStore(noSubscribe, () => readStored(storageKey), () => undefined);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  if (stored !== undefined && hydratedKey !== storageKey) {
    setHydratedKey(storageKey);
    const s = parseSaved(stored);
    if (s) {
      setPrefs(s.prefs);
      setExcluded(s.excluded);
      setResult(s.result);
      setOption(s.option);
      setCurrent(s.current);
      setChange(s.change);
      setDeselected(new Set(s.deselected));
      setView(s.result ? s.view : "settings");
    }
  }

  useEffect(() => {
    if (hydratedKey !== storageKey || sent.current) return;
    try {
      const s: Saved = { v: 1, at: Date.now(), view, prefs, excluded, result, option, current, change, deselected: [...deselected] };
      window.sessionStorage.setItem(storageKey, JSON.stringify(s));
    } catch {
      /* storage unavailable: nothing is kept */
    }
  }, [hydratedKey, storageKey, view, prefs, excluded, result, option, current, change, deselected]);

  // Moving between steps: start at the top and put focus on the new step's heading.
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current = false;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [view, result]);

  function go(next: View) {
    focusNext.current = true;
    setView(next);
  }

  const params = (exclude = excluded) => ({
    team_id: team?.id ?? null,
    team_size: prefs.teamSize,
    preset: prefs.preset,
    must_roles: team ? [] : prefs.mustRoles,
    min_shared_hours: team || prefs.minHours === "" ? null : Number(prefs.minHours),
    strict: prefs.strict,
    exclude_ids: exclude.map((e) => e.id),
  });

  async function generate(exclude = excluded) {
    setLoading(true);
    try {
      const res = await apiFetch<FormResponse>(`/api/spaces/${spaceId}/match/form-team`, { method: "POST", json: params(exclude) });
      setResult(res);
      setOption(0);
      setCurrent(res.proposals[0] ?? null);
      setChange(null);
      setDeselected(new Set());
      if (view !== "review") go("review");
    } catch (err) {
      toast.error((err as ApiClientError).message);
    } finally {
      setLoading(false);
    }
  }

  function pickOption(i: number) {
    if (!result?.proposals[i]) return;
    setOption(i);
    setCurrent(result.proposals[i]);
    setChange(null);
    setDeselected(new Set());
  }

  async function openReplace(memberId: string) {
    if (!current) return;
    setReplacingId(memberId);
    try {
      const res = await apiFetch<ReplaceResponse>(`/api/spaces/${spaceId}/match/replace`, {
        method: "POST",
        json: { ...params(), member_ids: current.members.filter((m) => m.kind === "candidate").map((m) => m.id), remove_id: memberId },
      });
      setReplace(res);
    } catch (err) {
      toast.error((err as ApiClientError).message);
    } finally {
      setReplacingId(null);
    }
  }

  function applyReplacement(o: ReplaceResponse["options"][number]) {
    if (!replace || !current) return;
    setChange({ removed: replace.removed.name, added: o.candidate.name, delta: o.delta, partDeltas: o.part_deltas, previous: current.score });
    setCurrent(o.team);
    setReplace(null);
  }

  function exclude(m: { id: string; name: string }) {
    const next = [...excluded.filter((e) => e.id !== m.id), m];
    setExcluded(next);
    void generate(next);
  }

  function allow(id: string) {
    const next = excluded.filter((x) => x.id !== id);
    setExcluded(next);
    if (result && view === "review") void generate(next);
  }

  const candidates = current?.members.filter((m) => m.kind === "candidate") ?? [];
  const selected = candidates.filter((c) => !deselected.has(c.id));

  async function sendInvites() {
    if (!current || selected.length === 0) return;
    setSending(true);
    try {
      const ids = selected.map((c) => c.id);
      const res = team
        ? await apiFetch<{ team_id: string }>(`/api/teams/${team.id}/invitations`, { method: "POST", json: { user_ids: ids, message } })
        : await apiFetch<{ team_id: string }>(`/api/spaces/${spaceId}/invitations`, {
            method: "POST",
            json: {
              user_ids: ids,
              message,
              team: {
                name: teamName,
                description: "",
                open_positions: prefs.teamSize - 1,
                recruiting: true,
                requirements: { must_roles: prefs.mustRoles, min_shared_hours: prefs.minHours === "" ? null : Number(prefs.minHours) },
              },
            },
          });
      try {
        window.sessionStorage.removeItem(storageKey); // sent: never show this draft again
      } catch {
        /* ignore */
      }
      sent.current = true;
      toast.success(`${ids.length} invitation${ids.length === 1 ? "" : "s"} sent. Each person decides whether to join.`);
      setSendOpen(false);
      router.push(`/s/${slug}/teams/${res.team_id}`);
      router.refresh(); // also re-render shared layouts (inbox counts, demo bar)
    } catch (err) {
      const e = err as ApiClientError;
      toast.error(e.message);
      if (["INVITE_NO_LONGER_VALID", "DUPLICATE_PENDING", "TEAM_FULL"].includes(e.code)) {
        setSendOpen(false);
        void generate();
      }
    } finally {
      setSending(false);
    }
  }

  const reviewing = view === "review" && result !== null;
  const step: 1 | 2 | 3 = !reviewing ? 1 : sendOpen ? 3 : 2;
  const openPositions = team ? Math.max(team.targetSize - team.members, 0) : prefs.teamSize - 1;

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 sm:gap-7">
      <StepIndicator current={step} onSelect={(s) => s === 1 && go("settings")} />
      <p role="status" aria-live="polite" className="sr-only">{loading ? "Generating a recommended team…" : ""}</p>

      {!reviewing ? (
        <section aria-labelledby="formation-heading" className="flex flex-col gap-6">
          <header>
            <p className="text-sm text-muted-foreground">Smart Team Formation · {spaceTitle}</p>
            <h1 id="formation-heading" ref={headingRef} tabIndex={-1} className="mt-1 text-3xl font-bold tracking-tight outline-none sm:text-4xl">
              {team ? `Complete “${team.name}”` : "Build your ideal team"}
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              {team
                ? `Your ${team.members} accepted member${team.members === 1 ? "" : "s"} stay on the team. TrojanMatch fills ${openPositions} open position${openPositions === 1 ? "" : "s"} using the team's own requirements.`
                : "Create a balanced team based on roles, goals, and availability."}
            </p>
          </header>

          {result && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
              <span>Your recommended team is still here. Change preferences and generate again, or go back to it.</span>
              <Button variant="outline" size="sm" onClick={() => go("review")}>
                <ArrowLeft data-icon="inline-start" aria-hidden /> Back to recommended team
              </Button>
            </div>
          )}

          <div className="rounded-2xl border bg-card p-5 shadow-xs sm:px-7 sm:py-6">
            <FormationSettings prefs={prefs} onChange={setPrefs} sizes={sizes} presets={presets} existingTeam={!!team} />

            {excluded.length > 0 && (
              <ExcludedList excluded={excluded} onAllow={allow} className="mt-5" />
            )}

            <div className="mt-5 flex justify-center">
              <Button size="lg" onClick={() => generate()} disabled={loading} className="h-12 w-full max-w-sm text-base" data-testid="generate-team">
                {loading ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Sparkles data-icon="inline-start" aria-hidden />}
                {loading ? "Generating…" : "Generate team"}
              </Button>
            </div>
          </div>

          {eligibility}
        </section>
      ) : (
        <section aria-labelledby="formation-heading" className="flex flex-col gap-6" data-testid="proposal">
          <header className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Smart Team Formation · {spaceTitle}</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 id="formation-heading" ref={headingRef} tabIndex={-1} className="text-3xl font-bold tracking-tight outline-none">
                {current ? "Recommended team" : "No team to recommend yet"}
              </h1>
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => go("settings")}>
                  <SlidersHorizontal data-icon="inline-start" aria-hidden /> Edit preferences
                </Button>
                {result.proposals.length > 1 && (
                  <Button
                    variant="outline"
                    onClick={() => pickOption((option + 1) % result.proposals.length)}
                    disabled={loading}
                    data-testid="try-another"
                  >
                    <RefreshCw data-icon="inline-start" aria-hidden /> Try another team
                  </Button>
                )}
              </div>
            </div>
            {current && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <MatchPill band={current.band} />
                <p className="text-sm text-muted-foreground" data-testid="team-summary">{teamSummary(current)}</p>
              </div>
            )}
            {current && result.proposals.length > 1 && (
              <p className="text-xs text-muted-foreground" data-testid="option-label">
                {change ? "Your edited version of " : "Showing "}
                {option === 0 ? "the best match" : `alternative ${option}`} · option {option + 1} of {result.proposals.length}
              </p>
            )}
            {change && current && (
              <p role="status" data-testid="replace-summary" className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                Replaced <strong>{change.removed}</strong> with <strong>{change.added}</strong>.
                <span className="text-muted-foreground">
                  Overall fit {Math.abs(change.delta) < 0.0005 ? "is unchanged" : change.delta > 0 ? "improved" : "went down"}
                </span>
                <span className="sr-only">(see detailed analysis for scores)</span>
              </p>
            )}
          </header>

          {result.message && (
            <section role="status" data-testid="match-message" className="rounded-xl border border-brand-gold/60 bg-brand-gold/10 p-4 sm:p-5">
              <h2 className="font-medium">{result.proposals.length === 0 ? "No matches yet" : "Heads up"}</h2>
              <p className="mt-1 text-sm">{result.message}</p>
              {result.suggestions.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                  {result.suggestions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
              {result.proposals.length === 0 && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => go("settings")}>
                  <SlidersHorizontal data-icon="inline-start" aria-hidden /> Adjust preferences
                </Button>
              )}
            </section>
          )}

          {current && (
            <>
              <ul className={cn("grid gap-3 sm:grid-cols-2 sm:items-start", loading && "opacity-60")} aria-label="Team members" aria-busy={loading}>
                {current.members.map((m) => (
                  <li key={m.id}>
                    <TeamMemberCard
                      member={m}
                      highlight={!!change && m.name === change.added}
                      onReplace={() => openReplace(m.id)}
                      replacing={replacingId === m.id}
                      replaceDisabled={replacingId !== null || loading}
                      onExclude={() => exclude({ id: m.id, name: m.name })}
                      excludeDisabled={loading}
                    />
                  </li>
                ))}
              </ul>
              {(excluded.length > 0 || current.members.some((m) => m.synthetic)) && (
                <div className="-mt-3 flex flex-col gap-2">
                  {excluded.length > 0 && <ExcludedList excluded={excluded} onAllow={allow} />}
                  {current.members.some((m) => m.synthetic) && (
                    <p className="text-xs text-muted-foreground">Profiles marked synthetic are demo data, not real students.</p>
                  )}
                </div>
              )}

              <section aria-labelledby="why-heading" className="flex flex-col gap-3">
                <h2 id="why-heading" className="text-xl font-bold tracking-tight">Why this team?</h2>
                <ul className="grid gap-3 md:grid-cols-3">
                  {whyThisTeam(current).map((c) => {
                    const Icon = c.tone === "weak" ? AlertTriangle : WHY_ICON[c.key];
                    return (
                      <li key={c.key} className="rounded-xl border bg-card p-4" data-testid={`why-${c.key}`} data-tone={c.tone}>
                        <h3 className="flex items-center gap-2 font-semibold">
                          <Icon className={cn("size-5 shrink-0", c.tone === "weak" ? "text-amber-600 dark:text-amber-400" : "text-primary")} aria-hidden />
                          {c.title}
                          <span className="sr-only"> ({TONE_TEXT[c.tone]})</span>
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {candidates.length > 0 && (
                <section
                  aria-labelledby="send-heading"
                  data-testid="send-invites"
                  data-toast-avoid
                  data-sticky-invite
                  className="z-10 flex flex-col gap-4 rounded-2xl border border-primary/40 bg-card p-4 shadow-lg shadow-primary/5 sm:flex-row sm:items-center sm:justify-between sm:p-5 lg:sticky lg:bottom-3"
                >
                  <div className="flex min-w-0 gap-3">
                    <UsersRound className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
                    <div className="min-w-0">
                      <h2 id="send-heading" className="font-semibold">
                        {selected.length === 0 ? (
                          "Select who to invite"
                        ) : (
                          <>
                            Ready to invite <span className="text-primary">{selected.length}</span> {team ? "more " : ""}teammate{selected.length === 1 ? "" : "s"}
                          </>
                        )}
                      </h2>
                      <fieldset className="mt-2 flex flex-wrap gap-1.5">
                        <legend className="sr-only">Who to invite</legend>
                        {candidates.map((c) => {
                          const on = !deselected.has(c.id);
                          return (
                            <label
                              key={c.id}
                              className={cn(
                                "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                                on ? "border-primary/30 bg-primary/5" : "text-muted-foreground line-through decoration-muted-foreground/50",
                              )}
                            >
                              <input
                                type="checkbox"
                                className="size-4 accent-[var(--primary)]"
                                checked={on}
                                onChange={(e) => {
                                  const next = new Set(deselected);
                                  if (e.target.checked) next.delete(c.id);
                                  else next.add(c.id);
                                  setDeselected(next);
                                }}
                              />
                              {c.name}
                            </label>
                          );
                        })}
                      </fieldset>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                    <Button size="lg" onClick={() => setSendOpen(true)} disabled={selected.length === 0} className="h-11">
                      <Send data-icon="inline-start" aria-hidden /> Send {selected.length} invitation{selected.length === 1 ? "" : "s"}
                    </Button>
                    <p className="text-xs text-muted-foreground sm:text-right">
                      <span data-testid="draft-status">Draft proposal · nobody has been invited</span>
                      <br />
                      Nothing is sent until you confirm. Invitations expire after 48 hours.
                    </p>
                  </div>
                </section>
              )}
              <DetailedAnalysis
                result={result}
                current={current}
                option={option}
                change={change}
                existingTeam={!!team}
                candidateCount={candidates.length}
                onPickOption={pickOption}
                open={analysisOpen}
                onOpenChange={setAnalysisOpen}
              />

            </>
          )}
        </section>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {selected.length} invitation{selected.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              {team
                ? `They're invited to “${team.name}”. Each person joins only if they accept. Invitations expire after 48 hours.`
                : `This creates your team (you're the owner) and invites the people below. Each person joins only if they accept. Invitations expire after 48 hours.`}
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc pl-5 text-sm" aria-label="Invitees">
            {selected.map((c) => (
              <li key={c.id}>{c.name}</li>
            ))}
          </ul>
          {!team && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-team-name" className="text-sm font-medium">Team name</label>
              <input id="new-team-name" className={inputClass} value={teamName} maxLength={60} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Trojan Builders" />
              <p className="text-xs text-muted-foreground">Team size {prefs.teamSize}: you + {prefs.teamSize - 1} open positions. The team is Forming until enough people accept.</p>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-message" className="text-sm font-medium">
              Message <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea id="invite-message" maxLength={280} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Why you'd like to team up." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button onClick={sendInvites} disabled={sending || (!team && teamName.trim().length < 2)}>
              {sending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden /> : <Send data-icon="inline-start" aria-hidden />}
              Send invitations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={replace !== null} onOpenChange={(o) => !o && setReplace(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-md">
          {replace && (
            <>
              <SheetHeader className="p-0 pb-3">
                <SheetTitle>Replace {replace.removed.name}</SheetTitle>
                <SheetDescription>
                  Each option shows how the whole team changes. Current team fit: {replace.current.score.toFixed(3)}.
                </SheetDescription>
              </SheetHeader>
              {replace.options.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other eligible candidates in this Space.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {replace.options.map((o) => (
                    <li key={o.candidate.id} className="rounded-xl border p-3" data-testid="replace-option">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{o.candidate.name}</p>
                          <p className="text-sm text-primary">{o.candidate.role ?? o.candidate.roles[0] ?? "Role not set"}</p>
                        </div>
                        <DeltaChip value={o.delta} digits={3} testId="replace-delta" />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Team fit {replace.current.score.toFixed(3)} → {o.team.score.toFixed(3)} ({o.team.band})
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {o.team.dimensions.map((d) => (
                          <DeltaChip key={d.key} value={o.part_deltas[d.key]} label={`${d.label} `} />
                        ))}
                      </div>
                      {o.candidate.reasons.length > 0 && <p className="mt-2 text-xs">{o.candidate.reasons.join(" · ")}</p>}
                      <Button size="sm" className="mt-3" onClick={() => applyReplacement(o)} aria-label={`Use ${o.candidate.name} instead`}>
                        Use {o.candidate.name.split(" ")[0]} instead
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MatchPill({ band }: { band: TeamView["band"] }) {
  const { className, icon: Icon } = BAND_PILL[band];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ring-1", className)} data-testid="match-label">
      <Icon className="size-4" aria-hidden />
      {matchLabel(band)}
    </span>
  );
}

function ExcludedList({ excluded, onAllow, className }: { excluded: { id: string; name: string }[]; onAllow: (id: string) => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 text-sm", className)} data-testid="excluded">
      <span className="text-muted-foreground">Not suggesting:</span>
      {excluded.map((e) => (
        <span key={e.id} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs">
          {e.name}
          <button type="button" aria-label={`Allow ${e.name} again`} className="rounded-full p-0.5 hover:bg-muted" onClick={() => onAllow(e.id)}>
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
