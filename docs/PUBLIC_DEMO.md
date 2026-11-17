# Public recruiter demo (password-free)

Replaces the hackathon-era *presenter* demo. Before, one shared sandbox (slot 0) was gated by a
presenter code, and every start reset it for everyone. Now any visitor clicks **Try Interactive
Demo** and gets their **own** sandbox.

## How it works

1. `POST /api/demo/start` (public, Origin-checked, no body):
   - If the browser already holds an active lease, it **resumes** that lease. No reset happens.
   - Otherwise it applies the per-visitor throttle: `DEMO_STARTS_PER_HOUR` per salted IP hash.
   - It then calls `demo_acquire_slot`, which picks a free, seeded slot in `1..DEMO_SLOTS` under an
     advisory lock, and caps active sandboxes per visitor (`DEMO_MAX_SESSIONS_PER_VISITOR`).
   - It resets **that slot only** to the synthetic fixture, signs in as Jordan, and sets the
     httpOnly `tm_demo_lease` cookie.
   - If no slot is free, it returns `503 DEMO_BUSY` with a retry time. The UI offers the video instead.
   - The per-visitor throttle (`demo_rate_take`, migration 0012) is atomic and, when reached, returns
     `429 RATE_LIMITED` with `details.retry_at` and a `Retry-After` header: the moment this visitor's
     own oldest counted start leaves the hour (nothing about other visitors). Blocked attempts are not
     recorded, so retrying never pushes the time back. The UI shows the local time and a countdown,
     disables the button until then, and offers the video.
   - A browser that already holds a valid lease always **resumes** it, even while throttled, without
     using a start. The landing and demo pages show **Resume your demo** in that case, and a demo
     visitor whose app session ended is sent to `/demo?expired=1` (never to the sign-in form).
2. `proxy.ts` calls `demo_lease_valid` on every request. It checks that the lease is the current one
   **for the caller's own slot**, and records activity at most once a minute. Invalid, expired or
   idle sessions are signed out and redirected to `/demo?expired=1`.
3. `switch`, `reset` (restart), `simulate-joins` and `end` all need an active lease, and act only on
   the lease's slot.
   - `switch` accepts a persona key from the fixture allowlist (all 44 synthetic students), or a user id
     that resolves (via the Auth admin API) to a synthetic persona **of the same slot**. The email is
     always derived from the key and the lease's slot, so neither form can reach another sandbox or a
     production account.
   - `reset` restores the slot, renews the lease and signs in as Jordan again.
4. AI Kickoff calls `demo_ai_quota_take()` before Gemini.
   - Demo users get 4 Gemini kickoffs per visitor lease per hour, and 60 across all demo sandboxes
     per day. Beyond that they get the labeled deterministic template.
   - Production users always get `true`, and nothing is recorded for them.

Lease lifetime: hard expiry at `DEMO_LEASE_MINUTES` (default 60), and an idle timeout of 30 minutes.
Expired or idle slots are reclaimed by the next visitor, whose start resets the slot. That reset is
the cleanup step.

## Switching students (UI)

- **Switch student** (yellow demo bar, every page) opens a searchable picker: *Invited, waiting for an
  answer* → *Your team* → *Quick access* (Jordan, Maya, Priya, Alex) → *All students in your sandbox*.
  The current persona is marked and disabled.
- After invitations are sent, the team page shows **Next: accept as your invitees** with a
  "Switch to <name>" button per invitee, and the demo bar shows the same next step on every page.
  An invitee sees "<name> has an invitation waiting → Review invitations".
- Data: the full list is the static synthetic fixture (keys, names, role labels only). Invitees and
  teammates come from the current persona's own RLS-bound queries, so no service role is used to render
  the picker and nothing outside the visitor's sandbox is visible.
- Restart/end is a separate, smaller link at the far end of the bar ("Restart or end demo" → `/demo`,
  with a confirmation).

## Database changes (migration `20261117000012_demo_rate_take.sql`)

Additive only: `public.demo_rate_take(subject, kind, max, window_minutes) → {ok} | {ok:false, retry_at}`,
EXECUTE service_role only. Same ledger (`private.api_events`) and same limits as before; the old
`demo_rate_exceeded` / `demo_rate_record` stay for rollback compatibility.

## Database changes (migration `20261116000011_public_demo_pool.sql`)

Additive only. No data is deleted, no RLS policy changes, and applied migrations are not edited.

- `private.demo_slots`: new columns `holder_subject` (salted IP hash, never a raw IP),
  `started_at`, `last_seen_at`.
- New: `private.demo_lease_active`, and `public.demo_acquire_slot` and `public.demo_renew_lease`
  (both **service_role only**).
- New: `public.demo_ai_quota_take()` (authenticated; it only reads and writes the caller's own scope).
- Replaced bodies (same signatures and grants): `demo_check_lease` (adds the idle check) and
  `demo_lease_valid` (adds the idle check and touches `last_seen_at`).
- New index `api_events (kind, created_at)`.

## Deploying (after approval)

```bash
git switch main && git merge --ff-only feature/public-demo && git push

# 1. Database (review first; expect only the pending migration(s), e.g. 20261117000012)
npx supabase db push --dry-run
npx supabase db push

# 2. Seed the sandbox pool (44 synthetic users per slot; idempotent; slot 0 is untouched)
npx tsx scripts/seed-demo.ts --env .env.cloud.local --slots 1-10

# 3. Vercel env (Production): set
#    DEMO_SLOTS=10  DEMO_LEASE_MINUTES=60  DEMO_STARTS_PER_HOUR=6  DEMO_MAX_SESSIONS_PER_VISITOR=2
#    (DEMO_MODE_ENABLED, DEMO_PERSONA_SECRET, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY already exist.
#     DEMO_PRESENTER_CODE is no longer read; keep it until the new demo is stable so a rollback works.)
vercel --prod --scope dai0915

# 4. Smoke test (all from one IP: 4 sandbox starts in total, within DEMO_STARTS_PER_HOUR=6).
#    Run ONE project per command and use --no-deps for mobile: demo-mobile depends on
#    demo-desktop, and Playwright runs a dependency project's whole suite, ignoring -g.
B=https://trojanmatch-jade.vercel.app
E2E_BASE_URL=$B npx playwright test tests/e2e/demo-recruiter.spec.ts --project=demo-desktop -g "landing"
E2E_BASE_URL=$B npx playwright test tests/e2e/demo-recruiter.spec.ts --project=demo-mobile --no-deps -g "landing"
E2E_BASE_URL=$B npx playwright test tests/e2e/demo-recruiter.spec.ts --project=demo-desktop -g "two visitors"
```

Rollback: promote the previous Vercel deployment. Migration 0011 is additive. The old code only uses
slot 0, ignores the new columns and functions, and still needs `DEMO_PRESENTER_CODE`. The only
behavior change it would see is that its presenter lease now also ends after 30 idle minutes.

## Known risks / limits

- **Supabase Auth sign-in rate limit.** Every start, switch and restart is a server-side
  `signInWithPassword` from Vercel's egress IPs. That call goes to
  `/auth/v1/token?grant_type=password`, which Supabase limits to 150 requests per 5 minutes per IP
  (the token limiter). The separate 30-per-5-minutes *sign-ups* limit applies only to `/signup`
  and `/otp`, not to these sign-ins. The production limits are unchanged from the defaults. Under
  very heavy concurrent use, switches could still be throttled; watch for `INTERNAL` errors from
  `/api/demo/switch`.
- **Finite pool.** `DEMO_SLOTS` (max 20) is the number of simultaneous recruiters. Extra visitors
  see "busy" plus the video link. Each slot is 44 synthetic auth users.
- **IP-based throttles** are coarse. Visitors behind one NAT share a budget, and a distributed actor
  could occupy the pool for up to 30 idle minutes per slot. That denies the demo only and never
  touches data. A CAPTCHA (e.g. Turnstile) on start is the next step if this happens.
- **Auth sessions** for personas are not revoked on switch, by design to avoid a cookie race. They
  are useless without the lease cookie because the proxy checks it, and they expire with the JWT.
- **Gemini availability** is external. When Gemini fails or the budget is used, the kickoff falls
  back to the deterministic template, and the UI says why.
