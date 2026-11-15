# TrojanMatch — Implementation Plan v2 (approved)

## Context

TrojanMatch is a solo AI@USC Hackathon project. `docs/TrojanMatch_Final_Spec.md` (v2.0, fully read) is the source of truth, and the repo contains only that spec. v1 was approved in principle. This v2 makes the seven requested revisions.

**Constraints:**
- Now is **Sat Nov 14, about 15:23 PST**. Devpost closes **Sun Nov 15 at 11:00 PST**, which leaves about 19.5h of wall-clock time.
- Gemini (server-side) is the LLM.
- Local tools: Node 26, npm, Docker (for local Supabase through `npx supabase`), and gh.

**Main idea (unchanged):** the rules that must hold live in Postgres: scope and Space isolation, capacity, one team per Space, invitation state, and chat access. They are enforced by RLS, audited `SECURITY DEFINER` RPCs, constraints, and composite foreign keys. Next.js stays thin. Matching is pure, deterministic TypeScript, and the LLM only adds wording on top, with a deterministic fallback for every LLM path.

---

## Execution rules (final, approved with v2)

1. **One phase at a time.** Implement **P0 and P1 only**, then STOP and report. Never continue to the next phase without explicit approval.
2. **First implementation step:** save this approved architecture to `docs/IMPLEMENTATION_PLAN.md`.
3. **Confirmed dev test accounts early (P1).** `scripts/create-dev-users.ts` uses the admin API (`auth.admin.createUser({ email_confirm: true })`) to create `dev1@` and `dev2@trojanmatch.test` with scope `prod`, display names "Dev Tester A/B", and their password in `.env.local` (`DEV_TEST_PASSWORD`). It runs against local Supabase and the cloud project, so P2 joining can be tested with public sign-up disabled. Delete the test Spaces before submission.
4. **Presenter sandbox first.** P3 builds only **slot 0** (presenter): seed, start with the presenter code, persona switch, reset, simulate joins. The multi-slot judge pool (leases for slots 1..N, the "busy" handling, two-context E2E) moves to the **P8 buffer** and must never delay P4 or P5. `DEMO_SLOTS=0` is the default until then. The schema still carries `scope='demo:<n>'` from day one, so adding slots later needs no migration.
5. **Supported Supabase Auth APIs only.** Never write to or delete from `auth.*` tables directly. Sessions are managed with `signInWithPassword`, `signOut()` (including `{ scope: 'global' }` with the user's own session on reset or switch), `auth.admin.createUser` and `auth.admin.updateUserById`, `getUser()`, and `verifyOtp`. Stale demo sessions are handled by the `proxy.ts` lease and epoch check, which calls the supported `signOut()` on that request, plus the default short JWT expiry.
6. **Phase-boundary report**, every time: features implemented; tests actually run, with results; browser verification (what was clicked and at which widths); outstanding issues; git commit hash; next recommended phase.

---

## Change summary (v1 → v2)

1. **Auth:** email confirmation stays **on** in production. Demo accounts are pre-created and already confirmed by the server. Public sign-up is behind `PUBLIC_SIGNUP_ENABLED` and requires custom SMTP (or OAuth), and that dependency is documented. The UI never shows a "student verified" badge.
2. **Demo:** login is a new unauthenticated bootstrap, `POST /api/demo/start`. It checks a persona allowlist and leases a sandbox slot. Each judge gets an **isolated sandbox slot** behind an httpOnly lease cookie. Reset, simulate, and switch all require that lease, so admin work runs only on the server. Production data is unreachable from demo code because of the scope check in SQL. The presenter slot is reserved and protected by a code.
3. **DB:** `realm` is replaced by **`scope`** (`'prod'` or `'demo:<n>'`). Scope is denormalized onto the detail tables, and URL + year uniqueness is now `UNIQUE(scope, official_url_normalized, edition_year)`. Regression tests are added.
4. **Activation:** all-accepted auto-activation stays. A new owner-only **`finalize_team`** RPC activates the team once the minimum is met and cancels the remaining pending invitations, all inside one locked transaction. Tests are added.
5. **Schedule:** rebuilt as a clock-time plan with deploys every phase. Grow moves into P4 and Find into P5. **08:00–11:00 is reserved** for production verification, the video, and Devpost. Visualizations get cut before matching.
6. **Next.js 16:** `proxy.ts` replaces `middleware.ts`. Request APIs are async (awaited). `next lint` is replaced by the ESLint CLI. The installed version is checked in P0.
7. **DB security:** an RPC audit table, a non-exposed `private` schema for helpers, default `EXECUTE` revoked, explicit grants per role, `search_path=''`, fully schema-qualified names, and catalog-level plus direct-invocation security tests.

---

## A. Architecture diagram

```
┌──────────────────────────── Browser ─────────────────────────────┐
│ RSC pages + client islands (shadcn/ui)                             │
│ Supabase browser client: session + Realtime subscribe ONLY         │
│ Cookies: sb-* (Supabase session), tm_demo_lease (httpOnly, demo)   │
└───────────────┬──────────────────────────────────┬────────────────┘
                │ fetch /api/* (same-origin JSON)  │ Realtime WS (RLS)
                ▼                                  │
┌──────────── Next.js 16 on Vercel (App Router) ───┼────────────────┐
│ proxy.ts → Supabase session refresh, auth gate (UX), demo-lease    │
│            consistency check (stale demo session → sign out)       │
│ Server Components → reads via RLS-scoped server client             │
│ Route Handlers /api/* → withAuth(): getUser + Origin + Zod + limit │
│   ├─ lib/domain/*   → typed wrappers over public RPCs (as user)    │
│   ├─ lib/matching/* → pure TS engine                               │
│   ├─ lib/ai/*       → Gemini, structured JSON, timeout, fallback   │
│   └─ lib/demo/*     → service-role client — ONLY /api/demo/* +     │
│                        scripts; calls service_role-only SQL funcs  │
└───────────────┬──────────────────────────────────┬────────────────┘
                ▼                                  ▼
┌──────────── Supabase ─────────────────────────┐ ┌─ Gemini API ────┐
│ Auth (email+password, confirm ON; custom SMTP │ │ parse / explain │
│      required for public sign-up)             │ │ / kickoff       │
│ schema public  : tables (RLS) + client RPCs   │ └─────────────────┘
│ schema private : helpers + demo funcs (NOT    │
│                  exposed by PostgREST)        │
│ Realtime: messages, invitations               │
└───────────────────────────────────────────────┘
```

---

## B. Database schema & relationships

Migrations live in `supabase/migrations/`, one file per phase:
- `0001_schema`: tables, enums, constraints, indexes
- `0002_private_helpers_rls`: private schema, helpers, RLS policies, grants
- `0003_rpc_spaces`
- `0004_rpc_match_teams_invites`
- `0005_demo`
- `0006_realtime`

Each file includes its own `REVOKE` and `GRANT` statements. Types go to `lib/database.types.ts` through `supabase gen types`.

**Scope (replaces realm):** `scope text NOT NULL CHECK (scope = 'prod' OR scope ~ '^demo:[0-9]{1,2}$')`. It is set on `profiles` and `matching_spaces`, and denormalized onto `space_hackathon_details` and `space_course_details` through a composite FK `(space_id, scope) → matching_spaces(id, scope)`, so the copy can never drift. `private.current_scope()` returns the caller's profile scope.

**Enums:** `space_type(hackathon,course)`, `space_status(open,closed,archived)`, `visibility(public,unlisted)`, `join_policy(open,code)`, `team_status(draft,forming,active,archived)`, `invite_kind(invite,request)`, `invite_status(pending,accepted,declined,cancelled,expired)`.

| Table | Key columns | Constraints / notes |
|---|---|---|
| `profiles` | `id` (PK, FK `auth.users`), `scope`, `display_name`, `university`, `bio`, `skills text[]`, `roles text[]`, `interests text[]`, `experience`, `working_style jsonb`, `availability int2[]` (UTC hour-of-week), `timezone`, `onboarded`, `is_synthetic` | Created by the `private.handle_new_user` trigger. `scope` comes from `raw_app_meta_data`, which only the service role can set, and defaults to `'prod'`. No email column and no protected attributes. |
| `matching_spaces` | `id`, `scope`, `type`, `title`, `title_normalized`, `slug` (unique, random suffix), `identity_key`, `created_by`, `status`, `visibility`, `join_policy`, `verification` (always `community`), `min_team_size`, `max_team_size`, `team_size_source`, `team_deadline_at` | `UNIQUE(id, scope)` (target of the composite FKs) and **`UNIQUE(scope, identity_key)`**. pg_trgm index (`extensions` schema). `created_by` is never referenced by a policy or RPC. |
| `space_hackathon_details` | `space_id`, `scope`, `edition_year`, `organizer`, `official_url`, `official_url_normalized`, `starts_at`, `ends_at`, `timezone`, `format`, `location`, `rules_url` | FK `(space_id, scope)`. **`UNIQUE(scope, official_url_normalized, edition_year) WHERE official_url_normalized IS NOT NULL`**. `CHECK(ends_at >= starts_at)`. |
| `space_course_details` | `space_id`, `scope`, `university`, `term`, `course_code`, `course_title`, `allowed_sections text[]`, `assignment_name`, `assignment_key`, `instructions_url` | FK `(space_id, scope)` |
| `space_secrets` | `space_id`, `join_code` | RLS on with **no policies** |
| `participations` | `id`, `space_id`, `user_id`, `goal`, `goal_note`, `desired_roles[]`, `topics[]`, `availability_override`, `looking_for_team`, `accept_invites`, `smart_match_opt_in`, `visible_to_members`, `notes` | `UNIQUE(space_id,user_id)`. Consent flags default to false. Column-level `UPDATE` grant on preference columns only. |
| `teams` | `id`, `space_id`, `owner_id`, `name`, `description`, `status`, `recruiting`, `target_size`, `requirements jsonb`, `activated_at`, `activation_mode (auto/finalized)` | `UNIQUE(id, space_id)` |
| `team_members` | `team_id`, `space_id`, `user_id`, `role`, `can_recruit`, `status (active/left)`, `joined_at` | FK `(team_id, space_id)`. **`UNIQUE(space_id,user_id) WHERE status='active'`** guarantees one team per Space and settles accept races. Accepted members only. |
| `invitations` | `id`, `space_id`, `team_id`, `kind`, `user_id`, `actor_id`, `status`, `status_reason`, `message`, `expires_at`, `responded_by`, `responded_at`, `match_run_id` | FK `(team_id, space_id)`. **`UNIQUE(team_id,user_id) WHERE status='pending'`** |
| `match_runs` | `id`, `space_id`, `initiator_id`, `mode`, `input`, `result`, `candidate_count`, `algorithm_version` | Initiator only |
| `messages` | `id`, `team_id`, `author_id`, `body` (1–2000), `client_id`, `created_at` | Realtime publication. No update or delete. |
| `kickoff_briefs` | `id`, `team_id`, `brief jsonb`, `source`, `generated_by` | |
| `private.api_events` | `subject` (user id or IP hash), `kind`, `created_at` | Rate-limit ledger. Lives in `private`, so it is not exposed. |
| `private.demo_slots` | `slot` (0 = presenter), `lease_token_hash`, `leased_until`, `epoch` | Lives in `private`, so it is not exposed |

**Space identity:** keys are computed **in SQL** inside `create_space`:
- Hackathon: `h|norm(name minus the year token)|year`, with the separate URL + year index above.
- Course: `c|uni|term|code|assignment_key∥name|sorted sections`.
- `private.normalize_text` and `private.normalize_url` are both IMMUTABLE.
- Near-duplicates trigger a *warning* only: trigram similarity > 0.4, or a URL match within the same scope.

---

## C. Authentication & authorization

**Production users:**
- Supabase email + password with **email confirmation on**. The confirmation link lands on `app/auth/confirm/route.ts`, which calls `verifyOtp({token_hash,type})` and sets the session cookie.
- **Dependency:** Supabase's built-in mailer is for development only (heavily rate-limited and restricted), so real public sign-up **requires custom SMTP** such as Resend or Postmark, configured in the Supabase Auth settings. Google OAuth is the documented alternative.
- `PUBLIC_SIGNUP_ENABLED=false` until SMTP is verified. In that state the landing page shows Demo Mode plus sign-in for existing accounts.
- A confirmed email only means "account email confirmed". **No UI ever presents it as proof of student identity**, and there is no "USC verified" badge. The optional `.edu` allowlist is enforced in the `handle_new_user` trigger through `private.app_config`, and it is a spam filter, not identity verification.
- The server uses `supabase.auth.getUser()` and never accepts a client-supplied actor id.

**Demo accounts:**
- Created by `scripts/seed-demo.ts` with the admin API using `email_confirm: true` and emails `p{nn}.s{slot}@demo.trojanmatch.invalid` (`.invalid` addresses can't receive mail).
- `app_metadata.scope = 'demo:<slot>'`, and `is_synthetic` is true for every persona.
- **Passwords are never stored or shared.** Each one is `HMAC-SHA256(DEMO_PERSONA_SECRET, email)`, recomputed on the server when it signs in on the user's behalf.

**AuthZ layers:**
1. `proxy.ts` handles UX redirects and the demo-lease consistency check.
2. `withAuth` performs `getUser`, checks Origin against `NEXT_PUBLIC_APP_URL`, validates with Zod, and applies rate limits.
3. Audited DEFINER RPCs (section G2).
4. RLS on every `public` table.
5. Constraints and composite FKs.

**RLS summary:** unchanged from v1, except every scope test now uses `private.current_scope()`.
- Spaces are readable when the scope matches and the Space is public or I participate. Anonymous users see only prod public metadata.
- Profiles and participations are readable only where `visible_to_members` holds in a shared Space, between teammates, or between invitation counterparts.
- Messages require an active member of an active team.
- Spaces, teams, members, and invitations have **no direct INSERT, UPDATE, or DELETE policies**. Every write goes through an RPC.
- Space creators get no privileges at all, and creator metadata editing is cut.

---

## D. Demo Mode (redesigned)

**Bootstrap needs no prior session.** It works by allowlist plus lease:

1. **`POST /api/demo/start` {accessCode?}** is public, guarded by `DEMO_MODE_ENABLED` and a rate limit of 10 per hour per IP hash. If `DEMO_ACCESS_CODE` is set, the code is required. The route:
   - leases a free or expired slot from 1 to `DEMO_SLOTS` (`private.demo_lease_slot`, `FOR UPDATE SKIP LOCKED`), or returns "all sandboxes busy, retry in N min";
   - generates a 32-byte token and stores only its SHA-256 in `demo_slots`;
   - sets the cookie `tm_demo_lease=<slot>.<token>` (httpOnly, Secure, SameSite=Lax, valid for `DEMO_LEASE_MINUTES`);
   - calls `private.demo_reset_slot(slot)`, which bumps the epoch;
   - signs in as the slot's **presenter persona** from the allowlist.
2. **`POST /api/demo/switch` {personaKey}** requires a valid lease. `personaKey` must be in `lib/demo/personas.ts` `SWITCHABLE = ['jordan','maya','priya','alex']`. The email is derived from the server-side allowlist and lease slot, never from client input. The route signs out the current session and signs in as the chosen persona.
3. **`POST /api/demo/reset`** and **`/api/demo/simulate-joins` {spaceId,count}** require a valid lease. Simulate-joins asserts that `spaceId` belongs to `scope='demo:'||slot`.
4. **Presenter slot 0** is never auto-leased. `/api/demo/start` with `DEMO_PRESENTER_CODE` leases slot 0, which keeps the live pitch safe from judges who are trying the app.

**Keeping production safe:**
- All demo SQL functions live in `private`, are `GRANT EXECUTE TO service_role` only, and take a `p_slot int`. Each one asserts `p_slot BETWEEN 0 AND max_slots`.
- They build the scope with `format('demo:%s', p_slot)` and delete or insert **only** `WHERE scope = v_scope`. The literal `'prod'` can't match that regex-checked value.
- The service-role client exists only in `lib/demo/admin.ts`, which is imported only by `/api/demo/*` and scripts. An ESLint `no-restricted-imports` rule enforces this.
- **Stale sessions** (supported Auth APIs only, with no writes to `auth.*` tables):
  - Reset and switch call `signOut({ scope: 'global' })` on the current persona session before signing in again.
  - `demo_reset_slot` bumps `demo_slots.epoch`.
  - `proxy.ts` calls `signOut()` for any demo-scope user whose lease cookie is missing, doesn't match the current token hash, or doesn't match the epoch.
  - The residual risk is an already-issued access token staying valid until its JWT expiry (1h default), and it only exposes synthetic data in that slot.

**Fixtures** (`lib/demo/fixtures.ts`, synthetic and the same for every slot): about 44 personas per slot, with 4 switchable. Seeded content:
- `AI@USC Hackathon 2026`: public, 32 participants, a few recruiting teams.
- `TreeHacks 2026`: a public decoy that shows year separation.
- `USC / Fall 2026 / CSCI 567 / Sec 1 / Final Group Project`: unlisted with a code, 16 participants. About 6 of them are also in the hackathons, with different goals.
- `TreeHacks 2027` is **not seeded**. It is created live, then simulate-joins enrolls 12 personas through the same join logic.

With `DEMO_SLOTS=4` plus the presenter slot, that is 5 × 44 = 220 auth users, created once by an idempotent seed. If time runs short, `DEMO_SLOTS=2` still isolates judges.

---

## E. API architecture

The `{error:{code,message}}` shape and error codes are unchanged from v1. New codes are `NOT_OWNER`, `BELOW_MIN_SIZE`, `INVITE_NO_LONGER_VALID`, `DEMO_BUSY`, and `DEMO_LEASE_INVALID`.

| Route | Backed by |
|---|---|
| `GET/PUT /api/profile`, `POST /api/profile/parse` | RLS / Gemini (suggestions only, never auto-saved) |
| `GET /api/spaces`, `GET /api/spaces/mine`, `POST /api/spaces/check-duplicates`, `POST /api/spaces` | `search_spaces`, `check_space_duplicates`, `create_space` (advisory lock, Space + details + creator participation, **no team**) |
| `GET /api/spaces/:id`, `POST /api/spaces/:id/join`, `GET /api/spaces/:id/invite-link` | `get_space_by_slug`, `join_space`, `get_invite_link` (any participant) |
| `GET/PUT /api/spaces/:id/participation` | RLS + column grants |
| `GET/POST /api/spaces/:id/teams`, `PATCH /api/teams/:id` | RLS / `create_team` / `update_team` |
| `POST /api/spaces/:id/match/form-team` · `/replace` · `/recommend-members` | `get_match_candidates` + `lib/matching` |
| `POST /api/match/explain` | Gemini, cached in `match_runs` (optional) |
| `POST /api/invitations` | `send_invitations` / `request_to_join` |
| `POST /api/invitations/:id/respond` · `/cancel` | `respond_invitation` / `cancel_invitation` |
| **`POST /api/teams/:id/finalize`** | **`finalize_team`** |
| `POST /api/teams/:id/leave` | `leave_team` (minimal) |
| `GET/POST /api/teams/:id/messages`, `POST /api/teams/:id/kickoff` | RLS / Gemini → `kickoff_briefs` |
| `POST /api/demo/start` · `/switch` · `/reset` · `/simulate-joins` | lease + service-role → `private.demo_*` |

**Team state rules:**
- **Auto-activation** (`private.evaluate_team`, called after accept, decline, cancel, or expiry): `draft/forming → active` when accepted ≥ max(min_team_size, 2) **and** no pending outbound invites. Active teams stay active while growing.
- **`finalize_team(p_team_id)`**, the owner's explicit early activation, runs in one transaction:
  1. `uid := auth.uid()`, which must be non-null. Lock the team with `FOR UPDATE`.
  2. Authorize: the caller must be the **owner** and an active member.
  3. Validate: team status is `draft` or `forming`; the Space is `open`; `now() < team_deadline_at` if one is set; and the Space scope matches the caller's scope.
  4. Validate capacity: `max(min_team_size,2) ≤ accepted ≤ min(target_size, max_team_size)`.
  5. Mark every pending outbound invite `cancelled` with `status_reason='team_finalized'`, and record the cancelled user ids in the return value.
  6. Set `status='active'`, `activation_mode='finalized'`, `activated_at=now()`, and `recruiting = (accepted < target_size)`.
  7. Pending inbound join requests stay if the team is still recruiting with capacity. Otherwise they are cancelled with `status_reason='team_full'`.

  Because `respond_invitation` locks the same team row first, accept and finalize serialize. An accept that loses the race sees `INVITE_NO_LONGER_VALID`.
- The UI shows "Finalize team with N members" only to the owner, and only when the minimum is met. A confirmation dialog lists who will be cancelled.
- **Expiry is lazy:** `private.expire_stale_invites(team or user)` runs at the start of each invite RPC and when the inbox loads. The TTL is 48h.

---

## F. Page & component structure

The route tree is unchanged from v1: S01–S16, Space context in the URL (`/s/[slug]/…`), and `/demo` for S16. Additions and changes:
- **Next.js 16 conventions:** `proxy.ts` at the root exports `proxy()`. `params`, `searchParams`, `cookies()`, and `headers()` are all awaited.
- **S16 `/demo`** has a Start Demo button (plus an access-code field if one is configured), a persona switcher (4 switchable personas), Reset sandbox, Simulate joins (on the current Space), and the remaining lease time. `DemoBanner` shows the sandbox number and "Synthetic data".
- **S14 and S15:** owner-only `FinalizeTeamDialog` and a status timeline (Forming → Active, auto or finalized).
- **Visual tiers:**
  - Core, always built: `FitBreakdown` (5 bars plus band), `RoleCoverageList`, and shared-hours text ("9 h/wk, Sat 10–16 PT").
  - Cut first: `ScheduleHeatmap`, `BaselineCompare`, alternative proposals, and LLM-worded explanations (templates are core).

---

## G. Matching algorithm

Unchanged from v1 (approved):
- **Gates:** SQL `get_match_candidates`, then TS hard filters, then SQL re-validation on send.
- **Score:** the spec's weighted five components, with SkillComplementarity computed as bipartite role coverage, plus per-type presets.
- **Search:** enumerate combinations when C(M,k) ≤ 20k, otherwise run a width-64 beam search. Fully deterministic, with ties broken by sorted user_id.
- **Operations:** distinct alternatives, Replace with full recomputation, and marginal gain for Grow, Find, and dynamic completion.
- **Extras:** a baseline comparison, a No-match funnel with suggested relaxations, and fact-id-grounded templates plus optional LLM wording.
- **Embeddings are removed from scope.** Interest similarity is tag-taxonomy only.

## G2. Database security: SECURITY DEFINER audit

**Rules applied to every function:**
- `SECURITY DEFINER` and `SET search_path = ''`.
- All names schema-qualified: `public.teams`, `private.is_participant`, `extensions.similarity`, `pg_catalog.now()`, `auth.uid()`.
- The first statement is `v_uid := auth.uid(); IF v_uid IS NULL THEN RAISE ... '28000'`.
- Functions never take an actor or user id parameter for the caller.
- `ALTER DEFAULT PRIVILEGES IN SCHEMA public, private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;`, then each function gets explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated` followed by an explicit `GRANT`.
- `private` is **not** in PostgREST's exposed schemas. `authenticated` gets `USAGE` on `private` plus `EXECUTE` on the RLS helpers only, so policies can call them but they can't be invoked over HTTP.

| Function | Schema | EXECUTE granted to | Checks inside |
|---|---|---|---|
| `current_scope`, `is_participant`, `is_active_member`, `can_recruit`, `profile_visible` | private | authenticated (used by RLS) | STABLE. Read-only booleans and scope. No data returned beyond that. |
| `normalize_text`, `normalize_url` | private | authenticated | IMMUTABLE, no table access |
| `handle_new_user` (trigger) | private | none (trigger only) | Scope from app_metadata, otherwise `'prod'`. Domain allowlist. |
| `search_spaces`, `get_space_by_slug` | public | anon, authenticated | anon: prod and public only. Unlisted Spaces return limited fields by exact slug. |
| `check_space_duplicates`, `create_space` | public | authenticated | Scope, identity key in SQL, advisory lock, rate limit |
| `join_space`, `get_invite_link` | public | authenticated | Scope match, status, code (rate-limited), participant-only link |
| `create_team`, `update_team` | public | authenticated | Participant, not already on a team / can_recruit |
| `get_match_candidates` | public | authenticated | Caller participant, scope, consent flags, open, deadline |
| `send_invitations`, `request_to_join`, `respond_invitation`, `cancel_invitation`, `finalize_team`, `leave_team` | public | authenticated | Team row lock, role check, scope, status, deadline, capacity, single membership |
| `evaluate_team`, `expire_stale_invites`, `rate_limit_hit` | private | none (called only by DEFINER RPCs) | Internal |
| `demo_lease_slot`, `demo_validate_lease`, `demo_reset_slot`, `demo_load_fixture`, `demo_simulate_joins` | private | **service_role only** | Slot range, scope built from the slot, no `'prod'` path |

Supabase's security advisor (`npx supabase db lint`) must be clean before each deploy.

---

## H. Security & privacy constraints

Unchanged from v1:
- Three-gate Space isolation.
- Consent flags default to off.
- Minimal PII to the LLM, with schema-validated output rendered as plain text.
- Unlisted slug suffix, a roughly 40-bit join code, and rate limits on failed codes.
- Participant-only `instructions_url`.
- Community-created badge and labels for unverified team sizes.
- No protected attributes.
- Zod, http(s)-only URLs, an Origin check, and rate limits.
- An 8s LLM timeout with fallbacks.

Additions:
- No student-identity claims from email.
- Demo credentials are HMAC-derived and server-only.
- An ESLint import restriction on the admin client.
- Demo lease cookies are httpOnly and stored hashed in the database.

---

## I. Environment variables

| Var | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public | RLS-bound client |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Only `lib/demo/admin.ts` and scripts |
| `NEXT_PUBLIC_APP_URL` | public | Origin check, confirmation redirect, invite links |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | server | LLM. Confirm the current Flash-class model ID in P0. |
| `AI_TIMEOUT_MS` (8000), `INVITE_TTL_HOURS` (48) | server | |
| `PUBLIC_SIGNUP_ENABLED` | server | `false` until custom SMTP is configured |
| `DEMO_MODE_ENABLED` | server | Gates `/demo` and `/api/demo/*` |
| `DEMO_PERSONA_SECRET` | server | HMAC key for persona passwords (32+ random bytes) |
| `DEMO_SLOTS` (4), `DEMO_LEASE_MINUTES` (45) | server | Sandbox pool |
| `DEMO_ACCESS_CODE` (optional), `DEMO_PRESENTER_CODE` | server | Gate for public demo starts / reserved slot 0 |
| `E2E_BASE_URL` | test | Playwright target |

Custom SMTP credentials live in the Supabase dashboard, not in the app's environment.

---

## J. Timebox (Sat 15:30 → Sun 11:00 PST)

Every phase ends with lint (ESLint CLI), typecheck, tests, build, **deploy to Vercel**, and a commit. A phase counts as done only once its UI, API, DB, permissions, and error states are wired and clicked through.

| Phase | PST | Work | Gate |
|---|---|---|---|
| P0 | 15:30–16:00 | Confirm event rules and start time. Run `create-next-app@latest`, **check `next --version` (expect ≥16, so use proxy.ts)**. Create the Supabase cloud project and start local Supabase. Link Vercel and GitHub. Confirm the Gemini model ID. | Blank app deployed |
| P1 | 16:00–18:30 | Save `docs/IMPLEMENTATION_PLAN.md`. Tailwind and shadcn. Supabase SSR clients and `proxy.ts`. Sign-in plus the confirm route (sign-up behind the flag). Migrations 0001–0002 (schema, scope, private schema, RLS, grants). **Dev test accounts dev1 and dev2 created confirmed through the admin API.** App shell and Space Switcher. **The catalog security test runs from here on.** | **Prod URL with auth by 18:30. STOP and report.** |
| P2 | 18:30–21:00 | Global profile (taxonomy pickers, simple availability grid). Space search, duplicate check, create (both forms), join and code, slug page, cold start, invite link, participation setup. Migration 0003 and its integration tests. | 0 results → create TreeHacks 2027 → auto-joined → link → second user joins. 2026 vs 2027 separate. |
| P3 | 21:00–22:00 | **Presenter sandbox (slot 0) only:** seed script, personas, fixtures, migration 0005, start with the presenter code, switch, reset, simulate, lease cookie, proxy check, banner | Presenter flow works. Reset leaves prod untouched. |
| P4 | 22:00–01:00 | `lib/matching` (unit tests first), `get_match_candidates`, form-team, replace, recommend-members. **S11 Smart Formation** (core visuals) and **S10 Grow My Team** (new team or my team, requirements, skill gap, candidates). | Smart and Grow return same-Space opted-in candidates only. Replace recomputes. |
| P5 | 01:00–03:30 | Migration 0004: send, request, respond, cancel, **finalize**, evaluate, expiry. Send Invites bar, S13 inbox, S14 My Teams, **S09 Find a Team** (list ranked by fit, request to join), Finalize dialog, re-recommend after decline. | **The demo journey works end to end up to Active, on prod.** Race, capacity, and finalize tests pass. |
| P6 | 03:30–05:00 | S15 workspace: messages, Realtime, optimistic composer. Gemini wrapper, then Kickoff with a template fallback, then profile parse. | A second browser sees messages live. Outsiders get 403. |
| P7 | 05:00–07:00 | Playwright judge flow and isolation specs. Finish the direct-RPC security tests. Fix the 375 and 1440 layouts. Empty, loading, and error states. | E2E passes against prod |
| P8 | 07:00–08:00 | **Buffer.** Only if everything is green: (1) the multi-slot judge sandboxes (slots 1..N, lease pool, two-context E2E), then (2) optional visuals (heatmap, baseline panel, alternatives, LLM explanations). | **Code freeze at 08:00** |
| V | 08:00–09:00 | **Production verification:** migrations match local, `db lint` is clean, seed is good, the presenter slot is reset, the 3-minute script runs twice on prod, and the Playwright smoke test passes on prod | Fixes only, no features |
| S1 | 09:00–10:15 | Demo video (presenter slot) and screenshots | |
| S2 | 10:15–10:45 | Devpost write-up and submission (no unverified claims, per spec §16.2) | **Submitted by 10:45** |
| — | 10:45–11:00 | Margin | |

**Checkpoints (decide on the clock, not on feel):**
- **01:00**, if P4 isn't done: cut alternatives and BaselineCompare, and simplify Grow to the skill-gap list plus invite.
- **03:30**, if P5 isn't done: Find a Team becomes a plain list with Request, and P6 runs templates only (no LLM parse or explain).
- **05:00**, if chat isn't done: ship chat without the optimistic retry. Kickoff stays template-backed.
- **Never cut:** Space isolation, consent, server-side authorization, synthetic labeling, Smart Formation scoring, explicit invites, accept, and finalize.

**Cut order for optional items:** ScheduleHeatmap → BaselineCompare → alternative proposals → LLM explanation wording → LLM profile parse → Find a Team filters → Kickoff regeneration → leave team. Embeddings are already out.

---

## K. Testing & deployment

**Vitest unit tests:** unchanged from v1 (score components, determinism, hard constraints, NO_MATCH funnel, Replace deltas, distinct alternatives, team vs baseline on the fixture, Gemini fallback). New: lease-token parsing and the persona allowlist mapping (an unknown key is rejected, and the email is never taken from input).

**Vitest integration tests** run against local Supabase with real JWTs, through supabase-js with the anon key. **Every RPC is called directly**, not through Next.js.
- **Scope uniqueness regression:**
  - The same `official_url_normalized + edition_year` is allowed once in `prod` and once in `demo:1`, and a second insert in `prod` fails.
  - The same identity key is allowed across scopes and rejected within one scope.
  - Detail-row scope can't differ from its Space (composite FK violation).
- **Isolation:** cross-Space candidate leakage, an opted-out user excluded, prod vs demo invisible to each other, and slot 1 vs slot 2 invisible to each other.
- **Spaces:** 2026 vs 2027 separate. The URL variant is flagged. Concurrent `create_space` produces one Space. Course term or assignment variants are separate. Unlisted requires the code. Creating a Space makes no team.
- **Invitations:**
  - Capacity overflow is rejected.
  - Two concurrent accepts across teams: exactly one succeeds.
  - No auto-activation while invites are pending.
  - An expired invite can't be accepted.
  - A non-owner can't invite.
- **Finalize:**
  - A non-owner (including a member with `can_recruit`) gets `NOT_OWNER`.
  - Below the minimum gets `BELOW_MIN_SIZE`.
  - After the deadline gets `DEADLINE_PASSED`.
  - A closed Space gets `SPACE_CLOSED`.
  - Already active or archived is rejected.
  - On success, pending invites become `cancelled/team_finalized`, the team is active, and the recruiting flag is correct.
  - A cancelled invitee's accept returns `INVITE_NO_LONGER_VALID`.
  - **Concurrent finalize and accept** (`Promise.all`) always ends with a consistent member count ≤ max and no orphaned pending invites.
- **Direct unauthorized RPC invocation:**
  - The anon key calls `send_invitations`, `finalize_team`, and `get_match_candidates`: all denied.
  - An authenticated user calls `respond_invitation` on someone else's invite, `finalize_team` on another team, and `get_match_candidates` for an un-joined Space: all denied with the right error code.
  - An authenticated user calling `private.demo_reset_slot` or `public.demo_*` gets PGRST202 or permission denied, because private isn't exposed and there is no grant.
  - Direct `INSERT` into `teams`, `team_members`, or `invitations`, and `UPDATE participations.space_id`, are all denied.
  - Messages: a pending invitee, another team, or the Space creator can't select or insert.
- **Catalog audit test (SQL through the service role):**
  - Every `prosecdef` function in `public` and `private` has `search_path=` in `proconfig`.
  - `has_function_privilege('anon', oid, 'EXECUTE')` is true only for the allowlisted functions (`search_spaces`, `get_space_by_slug`).
  - `PUBLIC` has EXECUTE on nothing.
  - `demo_*` functions are executable only by `service_role`.
  - Every `public` table has RLS enabled.
- **Demo:**
  - `/api/demo/switch` without a lease returns 401.
  - An unknown persona key returns 400.
  - Reset of slot N leaves the row counts for prod and the other slots unchanged.
  - A stale lease after re-lease is signed out by the proxy.

**Playwright** (two contexts):
1. Judge flow: Start Demo → search TreeHacks 2027 → 0 results → create → simulate joins → Smart → Replace → Send Invites → switch to Maya → accept → owner finalizes (or all accept) → Active → a live message appears in the other context → Kickoff.
2. Course Space: no code is denied, the code joins, and there's no hackathon-only persona among candidates.
3. Typing another team's workspace URL directly gives 403.
4. Two simultaneous Start Demo contexts get different slots.
5. Screenshots at 375 and 1440.

**Deploy:**
- Vercel linked to GitHub, env vars set in Vercel, and `export const maxDuration = 30` on AI routes.
- `npx supabase db push` to the cloud project, then `npm run seed:demo` (idempotent) from a laptop.
- Supabase Auth: **confirmation on**, site and redirect URLs set, and custom SMTP only if public sign-up is enabled.
- The JWT expiry stays at the default of 1h or shorter.
- Prod smoke test with `E2E_BASE_URL`.

---

## Spec contradictions & risks

Unchanged from v1 (resolutions 1–18 still stand), with these updates:
- **Item 4:** auto-activation needs every invite answered, **and** there is now an owner-only `finalize_team` for early activation.
- **Item 13:** the shared demo realm is replaced by leased per-judge slots plus a reserved presenter slot.
- **New: auth email dependency.** Confirmation on plus the built-in mailer means real public sign-up can't scale without custom SMTP. Mitigation: `PUBLIC_SIGNUP_ENABLED=false` by default, and the demo path doesn't depend on email.
- **New: residual stale demo access token.** It stays valid until JWT expiry, but only within a synthetic slot. Reset and switch revoke the current persona session with `signOut({ scope: "global" })`, and the proxy signs out stale sessions through the supported `signOut()` API. No direct writes to `auth.*` tables.
- **New: seed volume.** 220 demo auth users. The seed script is idempotent and batched, and `DEMO_SLOTS` can drop to 2.
- **New: Next.js 16 differences** (proxy.ts, async APIs, no `next lint`). Verified in P0 against the installed version, with the Supabase SSR session-refresh pattern adapted to `proxy()`.

---

## Verification (end-to-end)

1. Locally: `npx supabase start && npx supabase db reset && npm run seed:demo && npm run dev`.
2. `npm test` runs unit tests, integration tests (including finalize, scope uniqueness, and direct RPC tests), and the catalog audit, and must be green. `npx supabase db lint` must be clean.
3. `npx playwright test` locally, then `E2E_BASE_URL=<prod> npx playwright test --grep @smoke`.
4. 08:00–09:00: run the spec §16 three-minute script twice on the prod presenter slot, and check AC01–AC09 against real behavior (a README checklist).
