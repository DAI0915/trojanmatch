# P6 Handoff — Realtime Team Chat, Gemini AI Kickoff, Team Workspace

Status: **deployed and verified** 2026-11-14 (~23:50 PST).
Production: https://trojanmatch-jade.vercel.app (Vercel deployment `trojanmatch-ioaelbeni`).
Cloud migrations: 0001–0003, 0005–0010.

## 1. What P6 adds

| Area | Where |
|---|---|
| Migration | `supabase/migrations/20261114000010_chat.sql`: messages added to the `supabase_realtime` publication; BEFORE INSERT triggers on `messages` (author = caller, trim, 20 per minute per author) and `kickoff_briefs` (author = caller, 6 per team per hour, 32 KB cap); author index. Policies are unchanged from 0002. |
| APIs | `GET/POST /api/teams/:id/messages`, `POST /api/teams/:id/kickoff` (`maxDuration` 30) |
| Page | `/s/[slug]/teams/[teamId]/workspace`. Three columns on desktop, tabs (Chat / AI Kickoff / Team) on mobile. Non-members and inactive teams see a denied state with no team content. The team page shows "Open workspace" for members of an active team. |
| Libraries | `lib/workspace.ts` (RLS loader + deterministic fit via `toTeamView`), `lib/ai/gemini.ts` (server-only REST client), `lib/ai/kickoff.ts` (facts, prompt, Zod schema, sanitizer, template), `lib/api/team-access.ts`, `lib/validation/message.ts` |
| Components | `components/workspace/{team-chat,kickoff-panel,workspace-tabs}.tsx` |

## 2. Rules

- **Chat access:** only accepted members of an ACTIVE team can read or write. This is enforced by RLS in PostgreSQL and applies to Realtime as well, because each subscriber only receives rows its SELECT policy allows. No UPDATE or DELETE.
- **Messages:**
  - The trigger sets the author from `auth.uid()`; `author_id` isn't client-writable.
  - Bodies are trimmed to 1–2000 characters.
  - `(team_id, client_id)` is unique, so retries are idempotent.
  - Bodies render as plain text only.
- **Realtime client:** subscribes to postgres_changes for the team, refetches once about 2.5 s after the first subscribe (the change feed needs a moment to register) and again on reconnect/online, merges by id, and drops pending bubbles by client_id.
- **AI Kickoff:**
  - Runs only on an explicit click, for members of an active team.
  - The model sees only this team's consented matching features and the deterministic fit facts: score, role coverage, skills, and shared hours and windows. It never sees chat, bios, emails, other students, teams or Spaces.
  - The output is validated with Zod; role and owner ids that aren't team members are dropped.
  - Roles are labeled as suggestions.
  - The 6-per-hour check runs before Gemini is called.
- **Gemini model chain:** `GEMINI_MODEL` (default `gemini-3.6-flash`, `AI_TIMEOUT_MS` 18000) → `GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`, 8 s) → deterministic template. The UI says honestly which source produced the brief.

## 3. Gemini configuration

| Var | Production | Notes |
|---|---|---|
| `GEMINI_API_KEY` | set (sensitive; added by the owner) | server-only, sent in the `x-goog-api-key` header |
| `GEMINI_MODEL` | `gemini-3.6-flash` | stable; full kickoff takes 13–15 s |
| `GEMINI_FALLBACK_MODEL` | `gemini-3.5-flash-lite` | stable; about 1 s for a small request. `none` disables it. |
| `AI_TIMEOUT_MS` | `18000` | clamped to 2–20 s |

Model verification (live key, 2026-11-14):
- `models.list` includes 3.5, 3.6, 3.7 and 3.8 Flash.
- `gemini-3.8-flash` answered correctly but took **179 s**; 3.7 Flash and `gemini-flash-latest` timed out at 45 s. Not usable inside a 30 s function today.
- Live checks:
  - Local, opt-in `LIVE_GEMINI=1 npx vitest run tests/unit/kickoff.test.ts`: source=llm, `gemini-3.6-flash`, 13–15 s.
  - Production: 2 production-scope briefs with source=llm from `gemini-3.6-flash`.
  - Vercel logs show one primary timeout under load, which the fallback absorbed.

## 4. Tests

- `tests/integration/chat-rpc.test.ts` (17):
  - Forming team can't chat; chat activates when the team does.
  - Pending invitee, declined candidate, other team, Space creator, outsider, demo persona and anon all get nothing.
  - Append-only; no author spoofing; client_id dedupe; body limits; rate limits; kickoff permissions and limit.
  - **Realtime with two authenticated users:** delivered to the member; nothing reaches the pending invitee, outsider or other team.
- `tests/unit/kickoff.test.ts` (5 + 1 opt-in live): grounding has no PII or chat; deterministic template; no-key, invalid, HTTP and timeout fallbacks; key only in the header; non-member ids dropped.
- `tests/e2e/p6-chat.spec.ts` (dev1 + dev2, two browser contexts, 1440/375):
  - closed before Active; the pending invitee is denied;
  - accept leads to Active, then live chat both ways;
  - XSS renders as text; idempotent retry; 2001-character body gives 400; cross-origin gives 403;
  - reload keeps history; Kickoff works.
- `tests/e2e/p3-demo.spec.ts` "P6 A–H" (presenter, 1440 and 375):
  - invite Maya + Priya (Alex unchecked); both accept; Active;
  - Alex is denied the workspace, messages and kickoff;
  - Jordan opens the workspace; Maya sends a message; Jordan sees it attributed to Maya;
  - Kickoff is generated and persists across reload;
  - Reset removes the team, chat and kickoff.
- **Totals:** Vitest 281 passed + 1 skipped (live). Local Playwright 37 passed + 1 conditional skip. Production: every spec passed (see §5).

## 5. Production verification

- Snapshot before and after the migration: digests unchanged. Remote `db lint` is clean; `cloud-audit.sql` passes every check on PG 17.11; `messages` is in `supabase_realtime`.
- E2E against production:
  - The full run passed 34. That includes P6 two-user chat at both widths and the P6 presenter A–H at both widths, plus all P1/P3/P4-B/P5 specs.
  - P2/P4-A first failed on dev1's create_space limit (10 per hour, still busy from the P5 run). One rerun reused the tag. Both passed after the window cleared, with a fresh tag. No production rate-limit rows were touched.
- **Integrity:**
  - The 34 pre-existing production Spaces and 6 teams are intact.
  - All 8 production messages are in `P6 Chat Ex…` test Spaces.
  - 0 demo messages remain after reset; 0 cross-scope messages or members; 0 messages from non-members.
- New tagged test Spaces this phase: `Exyrede`, `Exzqvkt`, `P6 Chat Ex…` (kept, not deleted).

## 6. Known limitations

- `gemini-3.6-flash` takes 13–15 s; under load the primary can time out and the fallback model answers. The UI shows "Generating… (10–20 s)".
- Kickoff regenerate is limited to 6 per team per hour.
- The chat shows the latest 100 messages, with no pagination. There are no edits, reactions or attachments (out of scope per spec §8.1).
- In the presenter demo the second participant is a persona switch, not a second live browser (one lease per slot). Live two-browser delivery is verified with the dev accounts and in integration tests.
- The Realtime change feed needs about 1–3 s after subscribing. The chat refetches once to close that gap.

## 7. Presenter script (P6 portion)

1. Create TreeHacks 2027 and simulate 6 joins.
2. Smart Team Formation: uncheck Alex, then send 2 invitations ("Trojan Builders").
3. Switch to Maya, then Priya: each accepts. The team becomes **Active** (3 accepted, nothing pending).
4. Jordan: team page → Open workspace.
5. Switch to Maya: send a message. Switch back to Jordan: the message appears, attributed to Maya.
6. Jordan: AI Kickoff → Generate (about 15 s). The source badge shows "Generated by Gemini (gemini-3.6-flash)".
7. Demo controls → Reset.
