# TrojanMatch

**Stop searching. Start building.** Team formation for USC hackathons and course projects.
*AI recommends. Humans decide.*

**[Try the interactive demo →](https://trojanmatch-jade.vercel.app)** (one click, no sign-up) ·
**[3-minute video](https://youtu.be/u0y4W5DaLL0)**

Built solo for the AI@USC Hackathon 2026. Independent student project, not affiliated with or
endorsed by USC.

## Why

Hackathon teams that form *before* the event can meet, discuss ideas and plan responsibilities
before day one. Course-project teammates often differ in goals, schedules and commitment.
Finding compatible teammates early is the hard part, and most tools rank individuals one at a time.

TrojanMatch recommends **whole teams**. It scores every candidate team on role and skill coverage,
goals, interests, overlapping availability and working style, and explains each pick.

## What you can do in the demo

1. **Try Interactive Demo** gives you a private sandbox of about 44 synthetic students. You start as *Jordan Lee*.
2. Open **AI@USC Hackathon 2026** → **Smart Team Formation**, set preferences, then *Generate team*.
   It compares every possible team (1,160 in this Space) and explains the best one in plain language.
3. Open **See detailed analysis** for the scores, weights and the comparison with simple individual ranking. In this synthetic Space, whole-team optimization
   finds a team with 20 shared hours a week; picking the top individuals gives 4. Both cover all roles.
   This is an illustrative example, not a measured result.
4. **Replace** a candidate (the score is recomputed instantly), then **Send invitations**.
   Nothing is sent until you confirm.
5. You play every student. Right after sending, a **Switch to <invitee>** prompt appears; accept as each
   invitee. **Switch student** in the yellow demo bar lets you act as any of the 44 synthetic students
   (invitees and teammates first, then a searchable list). The team turns **Active** when everyone has answered.
6. Open the **team workspace** for real-time chat, then **AI Kickoff**. Gemini writes project ideas,
   suggested roles and first steps from the team's consented profiles. It never changes scores.

## Architecture

```
Browser ── Next.js 16 on Vercel (App Router, proxy.ts, Route Handlers)
              ├─ lib/matching   deterministic TypeScript engine (exhaustive / beam search)
              ├─ lib/ai         Gemini (server-side, JSON schema + Zod) → template fallback
              └─ lib/demo       service-role client, used ONLY by /api/demo/* and scripts
        ── Supabase: Postgres (RLS, SECURITY DEFINER RPCs), Auth, Realtime
```

- **Matching Spaces** are one hackathon edition or one course assignment. Search, matching,
  invitations and chat never cross Spaces, and Postgres enforces this, not just the UI.
- **Matching is deterministic**: a weighted whole-team score, exhaustive search when the number of
  combinations is ≤ 25,000, otherwise a width-64 beam search. Gemini is used only for the kickoff.
- **Invitations are explicit**, with capacity, one-team-per-Space and race safety enforced in SQL.

### The public demo: isolated sandboxes, no password

The demo is a **pool of isolated sandboxes**, slots 1…N. Each slot has its own scope `demo:<n>` and its own
synthetic personas.

| Concern | How it's handled |
|---|---|
| Visitors interfering with each other | Each visitor **leases a free slot** (`demo_acquire_slot`, serialized by an advisory lock), so two visitors never share one. Restart and reset only touch the visitor's own slot. A start never resets a slot someone else is using. |
| Production data | Every demo function derives its scope from a slot number (`demo:0..20`) and can never produce `prod`. Demo users only see their own scope (RLS + scoped RPCs). |
| Session auth | httpOnly lease cookie (random 32-byte token; only its SHA-256 is stored). `proxy.ts` checks the lease on every request and signs out stale sessions. Personas sign in via supported Auth APIs with server-derived passwords (HMAC). Secrets never reach the browser. |
| Expiry and cleanup | Hard limit `DEMO_LEASE_MINUTES` (60). A lease idle for 30 minutes frees its slot. The next visitor's start resets that slot to the fixture. |
| Abuse | Origin check. New sandboxes are limited per visitor (salted IP hash) per hour, at most N active per visitor, plus per-sandbox limits on restart, switch and simulate. The pool is finite: when it's full, visitors get a friendly "busy, try again" message with a link to the video. |
| Gemini cost | At most 4 Gemini kickoffs per visitor session per hour and 60 across all demo sandboxes per day (plus 6 per team per hour). Beyond that a deterministic template is used, and the UI says so. Production users are unaffected. |

## Stack

Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui · Supabase (Postgres, Auth, Realtime, RLS) ·
Gemini · Vitest · Playwright · Vercel

## Local development

```bash
npm install
npx supabase start -x studio,edge-runtime,logflare,vector,storage-api,imgproxy,postgres-meta
# create .env.local from `npx supabase status -o env` (see .env.example)
npm run dev-users                       # two CONFIRMED dev accounts (admin API, no email needed)
DEMO_SLOTS=4 npm run seed:demo -- --slots 1-4   # synthetic demo sandboxes (idempotent)
npm run dev
```

## Quality gates

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run db:lint                        # Supabase schema linter
E2E_SPACE_TAG=<letters> npx playwright test   # 1440px and 375px; use a fresh tag per run
```

`npm test` runs unit tests and integration tests against **local** Supabase. The integration tests use
real JWTs, direct RPC calls, a catalog-level security audit, and demo-pool isolation, expiry and budget tests.
Playwright covers the full recruiter journey, two simultaneous visitors, idle expiry, throttling and
unauthorized access.

## Deployment

- Production: https://trojanmatch-jade.vercel.app (Vercel project `trojanmatch`)
- Database: Supabase (Postgres 17). Migrations: `npx supabase db push --dry-run`, then `npx supabase db push`.
- Demo environment (Vercel, server-only): `DEMO_MODE_ENABLED=true`, `DEMO_PERSONA_SECRET`,
  `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_SLOTS`, `DEMO_LEASE_MINUTES`, `DEMO_STARTS_PER_HOUR`,
  `DEMO_MAX_SESSIONS_PER_VISITOR`, `GEMINI_API_KEY`.
- Seed the pool once per slot count: `npm run seed:demo -- --env <env file> --slots 1-N`
  (`--no-reset` re-registers without touching sandbox data).

Details: spec [`docs/TrojanMatch_Final_Spec.md`](docs/TrojanMatch_Final_Spec.md) ·
plan [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) ·
public demo [`docs/PUBLIC_DEMO.md`](docs/PUBLIC_DEMO.md)
