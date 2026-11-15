# P5 Handoff — Invitations, Find a Team, Acceptance & Activation

Status: **deployed and verified** on 2026-11-14 (~22:50 PST).
Production: https://trojanmatch-jade.vercel.app (Vercel deployment `trojanmatch-jrxned4xg`).
Cloud migrations applied: 0001–0003, 0005–0009 (no 0004).

## 1. What P5 adds

| Area | Where |
|---|---|
| Migration | `supabase/migrations/20261114000009_invitations.sql` |
| RPCs (authenticated) | `send_invitations`, `start_team_with_invitations`, `request_to_join`, `respond_invitation`, `cancel_invitation`, `finalize_team`, `refresh_invitations`, `find_teams` |
| Internal (no grants) | `private.invite_ttl`, `evaluate_team`, `expire_stale_invites`, `is_recruiter` |
| Replaced (same signature/grants) | `get_match_pool` (also excludes students who declined this team; ignores expired pending), `demo_clear_create_limits` (also clears create_team / send_invitations / request_to_join for sandbox personas) |
| APIs | `POST /api/teams/:id/invitations`, `POST /api/spaces/:id/invitations` (create team + invite), `POST /api/teams/:id/requests`, `POST /api/invitations/:id/respond`, `POST /api/invitations/:id/cancel`, `POST /api/teams/:id/finalize` |
| Pages | Smart Formation Send Invites bar + confirm dialog; Grow My Team Invite buttons; team page (status timeline, pending invitations, join requests, responses, replacement callout, Finalize, request to join); `/invitations` inbox; `/s/[slug]/find` Find a Team |
| Libraries | `lib/invitations.ts` (loaders), `lib/matching/find.ts` (fit ranking), `lib/validation/invitation.ts`, `components/invite/*`, `components/ui/dialog.tsx` |

## 2. Rules (enforced in PostgreSQL)

- Invites are explicit: generate/replace never sends. `send_invitations` re-validates every candidate with the pool rules (same Space + scope, all four consents, not on a team, no pending invite/request, has not declined this team). It is all-or-nothing, and hidden students' names never appear in errors.
- Capacity: accepted + pending invitations + new ≤ target. Pending invitations reserve seats. Requests don't reserve seats and can't take a reserved one.
- One team per Space: accepting expires all of the joiner's other pending invitations/requests (`joined_other_team`). A unique index is the backstop.
- Activation: a draft/forming team becomes `active` (auto) when accepted ≥ max(min_team_size, 2) **and** no outbound invitation is pending. The owner may `finalize_team` earlier (min met, Space open, before deadline). Finalizing cancels pending invites (`team_finalized`).
- Full team (accepted = target): `recruiting=false`, and remaining pending rows are cancelled (`team_full`).
- Expiry: 48 h (`private.app_config.invite_ttl_hours`). Expiry is lazy: `refresh_invitations` runs on inbox/team pages, and `send`/`request`/`finalize` sweep first. An expired invitation is recorded as expired and is never accepted (API returns `INVITE_EXPIRED`).
- Decline keeps accepted members. The declined student is excluded from that team's pool, and Grow recomputes recommendations.
- Accepting while owning a solo draft team returns `OWN_DRAFT_TEAM`. The UI asks for confirmation, then that team is archived and its invites are cancelled.
- Concurrency: every writer locks team rows in id order before touching invitations. Concurrent accepts, finalize and expiry serialize without deadlocks (Postgres 40P01/40001 maps to `TRY_AGAIN`).

## 3. Tests

- `tests/integration/invitations-rpc.test.ts`: 43 direct-RPC tests (concurrency, capacity, finalize, expiry, requests, Find a Team filters, demo/prod isolation, direct-write denial).
- `tests/unit/invitations.test.ts`: 7 tests.
- E2E `P5 A–I` in `tests/e2e/p3-demo.spec.ts` (presenter slot). Desktop: Alex declines and Jordan invites a replacement from Grow. Mobile: Alex accepts and the team fills (4/4, not recruiting).
- Totals: vitest 259/259. Playwright local 33 passed + 1 conditional skip. Production 45 passed (P1 rerun with `PUBLIC_SIGNUP_ENABLED=false`, as documented in P4-B).

## 4. Presenter demo script (P5)

1. Jordan creates **TreeHacks 2027** live, then in /demo simulates **6** joins (Maya, Priya, Alex, Grace, Amara, Lucas).
2. Smart Team Formation (size 4) recommends **Alex, Maya, Priya** (fit 0.814 in the offline check). With 12 joins the recommendation differs, so use 6.
3. Send 3 invitations, name the team, confirm. The team is Forming with 3 reserved seats.
4. Switch to Maya, then Priya: Invitations → Accept.
5. Switch to Alex: Accept (team fills, Active) or Decline (Active 3/4, then Jordan uses Find a replacement → Grow → Invite).
6. Find a Team: Jordan in AI@USC → filter role Backend → request to join **Campus Compass** → switch to Alex → Invitations → Accept.
7. Reset demo restores the seeded state.

## 5. Production verification

- Snapshot before and after the migration: prod digests unchanged. Remote `db lint` is clean, and every `cloud-audit.sql` check is clean on PG 17.11 (27 authenticated-executable functions, all allowlisted).
- After E2E: the 26 pre-existing prod Spaces and 4 prod teams are intact. The run added 8 test Spaces (6 tagged `Exracuc`) and 2 tagged teams. There are 0 prod invitations and 0 cross-scope memberships.

## 6. Known limitations

- Expiry is lazy (no cron): an unvisited invitation stays `pending` in storage past `expires_at`, but every read path treats it as expired and it can never be accepted.
- `update_team` (0007) can lower open positions below pending invitations. Acceptance still enforces capacity (`TEAM_FULL`).
- On mobile, the Find a Team filter form is fully expanded (long but usable).
- There is no leave/remove-member flow (not in P5 scope).

## 7. For P6 (not started)

- Chat/messages RLS already requires an active member of an active team (0002). P5 produces active teams through auto-activation and finalize.
- The migration timestamp must be later than `20261114000009`.
