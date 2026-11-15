# P4-B handoff — Matching Engine, Smart Team Formation, Replace, Grow My Team

Written Sat 2026-11-14 ~22:10 PST for the session that finishes P4-B (deployment only).
Devpost closes **Sun 2026-11-15 11:00 PST**. Code freeze target: 08:00 PST.

## 1. Where things stand

| Item | State |
|---|---|
| Branch | `phase/p4b-matching` (local only, **not pushed**) |
| `main` (local and GitHub) | `b216be2` (P4-A). Production runs P4-A. |
| P4-B code | Complete and verified **locally** |
| Cloud migration `20261114000008_matching.sql` | **Not applied** |
| Cloud demo sandbox | **Not re-seeded** (fixture gained the "Campus Compass" team) |
| Vercel | **Not deployed** |

Local verification on a freshly reset database (all green):
ESLint · `npm run typecheck` · `npm run db:lint` · Vitest **209/209** · `npm run build` · Playwright **31 passed, 1 skipped by design** (1440px and 375px).

Nothing in P4-B writes data: the migration adds two read-only functions, and the three matching APIs only read.

## 2. What was built

### Database — `supabase/migrations/20261114000008_matching.sql` (read-only)
- `public.get_match_pool(p_space_id, p_team_id default null)` — `STABLE SECURITY DEFINER`, `search_path=''`, EXECUTE for `authenticated` only. The single eligibility gate for all matching:
  - caller signed in, same scope as the Space (prod vs `demo:<n>`), participant;
  - Space `open` and before `team_deadline_at`;
  - with `p_team_id`: caller must be owner / `can_recruit` of that team in that Space (`NOT_RECRUITER` otherwise, same error if the team doesn't exist); without it: caller must not already be on a team (`ALREADY_IN_TEAM`);
  - candidates: same Space **and** scope, not the caller, all of `visible_to_members`, `accept_invites`, `smart_match_opt_in`, `looking_for_team` true, no accepted team in the Space, no pending invite from this team;
  - returns matching features only (no email, bio, university, notes) plus aggregate funnel counts.
- `private.match_person(space, user)` — helper, no grants.

### Engine — `lib/matching/engine.ts` (pure, deterministic, no I/O)
`Team Fit = Σ weight × component`, every component in [0, 1]:

| Component | Definition |
|---|---|
| Roles & skills | `0.7 × roleCoverage + 0.3 × skillScore` |
| roleCoverage | Each member is dedicated to at most one target role (exact DP over role subsets). Credit per role: 1 = dedicated member who lists it; 0.5 = listed by someone dedicated elsewhere, or filled by a "flexible" member; 0 = nobody. Weighted: required ×2, preferred ×1, default mix ×1. |
| skillScore | Share of the desired skills covered; if none are specified, share of the 5 skill areas covered. |
| Goal alignment | Mean pairwise compatibility (same 1, adjacent 0.6, opposite 0.2, unknown 0.5), blended 50/50 with the team's stated goal if set. Similarity only: no goal ranks higher. |
| Shared interests | Mean pairwise overlap coefficient over tags (weight 1) and their taxonomy group (0.5); blended 50/50 with the team's topics if set. |
| Availability overlap | `min(1, hours/week when EVERYONE is free ÷ target)`; target = team minimum, else 6 (hackathon) / 8 (course). |
| Working style | Mean pairwise match over collaboration, planning and check-in preferences. |

Weight presets (`PRESETS`): balanced `.30/.25/.20/.15/.10` (hackathon default), course `.25/.25/.10/.25/.15`, interests, schedule, goals. Bands: Strong ≥ .75, Good ≥ .60, Fair ≥ .45, else Weak. Weights are documented heuristics, not validated predictors.

Search (`formTeam`):
1. shortlist = top 24 candidates by individual gain + best 3 per target role;
2. if `C(shortlist, slots) ≤ 25,000` evaluate every team, else beam search (width 64);
3. ties: higher score, then lexicographically smaller sorted member ids (no randomness);
4. up to 2 alternatives that differ in more than half of the open slots;
5. baseline = top-k individually ranked candidates; always reported, and the result is never worse than it.

Outcomes: `ok`, `no_candidates`, `not_enough_candidates` (smaller honest proposal), `infeasible` (only when "strict" is on), `team_full`.
Also `replaceOptions` (re-scores the whole team per alternative, refuses accepted members) and `growRecommendations` (gain to the existing team, roles filled, skills added).

Measured locally: demo Space (20 eligible, 3 open slots) → 1,160 teams compared in ~27 ms. Beam path (80 people, 6 slots) stays under 60,000 evaluations.

### Service and API
- `lib/matching/service.ts` — `loadPool` (calls `get_match_pool` on **every** request), `formProposal`, `replaceCandidate`, `recommendMembers`. Rejects tampered compositions (anyone not currently eligible → `INVITE_NO_LONGER_VALID`; more people than open positions → `TEAM_FULL`). Open positions = target − accepted − pending invites.
- `lib/matching/view.ts` — minimal browser view (names, role, top skills, goal, reasons; no availability arrays).
- `POST /api/spaces/:id/match/form-team`, `/replace`, `/recommend-members` — read-only, `withAuth` + Zod.

### UI
- `/s/[slug]/smart` — pool summary + "View eligible participants", controls, recommended team (draft badge, member cards, dimension bars, role/skill coverage, availability, gaps, alternatives, baseline table), Replace sheet with whole-team deltas, "Don't suggest" exclusions.
- `/s/[slug]/grow` — gap analysis and ranked candidates for the team you recruit for.
- Discover hub has three entry cards; "Smart Match" nav item is enabled; team page has "Grow my team" for recruiters.
- No Send Invites button anywhere: a note says invitations arrive next (P5).

### Demo fixture
`lib/demo/fixtures.ts` adds **Campus Compass** (owner Alex, member Zoe, active, needs Backend + Frontend). Presenter flow: Jordan → AI@USC → Smart Team Formation → Replace; then Demo controls → Alex → Campus Compass → Grow my team. TreeHacks 2027 create-live flow is unchanged.

## 3. Tests (what covers what)

| Requirement | Test |
|---|---|
| A complementary skills improve coverage | `tests/unit/matching.test.ts` |
| B hard constraints, tampered proposals | `tests/integration/matching-rpc.test.ts` |
| C consent-off excluded (each switch) | integration |
| D cross-Space never returned | integration |
| E demo/production isolation | integration + `tests/e2e/p3-demo.spec.ts` |
| F accepted memberships respected | integration |
| G capacity incl. pending invites | integration + unit |
| H determinism | unit (input order, repeated runs, tie-break) |
| I beats individual-ranking baseline | unit (constructed case) |
| J replace updates scores exactly | unit + integration + E2E |
| K grow finds and fills role gaps | unit + integration + E2E |
| L unauthorized recruitment/profile access | integration + E2E (403 `NOT_RECRUITER`) |
| M nothing becomes a member/invite | integration (row counts) + E2E |
| N demo reset restores matching state | integration (slot 7), production digest unchanged |

Catalog audit (`tests/integration/catalog-security.test.ts`) allowlists `public.get_match_pool` for `authenticated`.

## 4. Remaining steps to finish P4-B (in this order)

Rules that still apply: deploy only to Vercel project `trojanmatch` (scope `dai0915`); never touch `my-portfolio`; do **not** delete the tagged production test Spaces; no secrets in output or commits; verify GitHub `main` directly after pushing; stop after P4-B (no P5/P6).

1. **Confirm the Supabase target**: `cat supabase/.temp/project-ref` must print `qhfmvsfnhdqfupvggzco`.
2. **Snapshot production before** (read-only):
   `npx supabase db query --remote=qhfmvsfnhdqfupvggzco --read-only -o json --file scripts/sql/prod-snapshot.sql` (also `prod-teams.sql`, `prod-limits.sql`). Save the outputs to compare later.
3. **Dry run**: `npx supabase db push --remote --dry-run` → must list only `20261114000008_matching.sql`.
4. **Apply**: `npx supabase db push --remote --yes`.
5. **Cloud audit**: run `scripts/sql/cloud-audit.sql` the same way; every non-`INFO` row must have empty `violations`. Then `npx supabase db lint --remote --level warning`.
6. **Re-seed the cloud demo sandbox** (fixture changed). The service key comes from the CLI, never printed:
   ```zsh
   SERVICE="$(npx supabase projects api-keys --project-ref qhfmvsfnhdqfupvggzco -o json 2>/dev/null | python3 -c "
   import json,sys
   raw=sys.stdin.read(); i=min([x for x in (raw.find('['),raw.find('{')) if x>=0]); d=json.loads(raw[i:])
   keys=d if isinstance(d,list) else (d.get('keys') or d.get('api_keys') or [])
   print(next(k['api_key'] for k in keys if k.get('name')=='service_role'))")"
   SUPABASE_SERVICE_ROLE_KEY="$SERVICE" npx tsx scripts/seed-demo.ts --env .env.cloud.local
   ```
   Expect `… 54 participations, 5 teams`. (Starting the demo also reloads the fixture, so this is belt and braces.)
7. **Commit state**: the branch is already committed. Fast-forward and push:
   `git checkout main && git merge --ff-only phase/p4b-matching && git push origin main phase/p4b-matching && git fetch origin && git log --oneline -1 origin/main`.
8. **Deploy**: `npx vercel@latest deploy --prod --yes --scope dai0915`; confirm `.vercel/project.json` says `trojanmatch` first.
9. **Production E2E** (`set -a && . ./.env.cloud.local && set +a` first; it holds `E2E_BASE_URL`, `DEV_TEST_PASSWORD`, `DEMO_PRESENTER_CODE`):
   - `npx playwright test --project demo-desktop --project demo-mobile` (includes the P4-B A–H flow);
   - `PUBLIC_SIGNUP_ENABLED=false npx playwright test tests/e2e/p1-auth-shell.spec.ts --project desktop --project mobile`;
   - optional P2/P4-A runs need `E2E_SPACE_TAG=Ex<5 random letters>`; each creates tagged production Spaces and dev1 may create only 10 Spaces/hour (a `429` there means wait, not a bug).
   - `scripts/verify-cloud.ts` needs `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the CLI (same pattern as step 6 with `name=='anon'`).
10. **Snapshot production after** and diff against step 2 — demo runs must leave all three unchanged.
11. **Report** using the eight headings in the P4-B request (methodology and optimization details are in §2 above).

Shell notes: the shell is zsh (unquoted `$VAR` holding a command is not word-split; put SQL in a file and use `--file`). `supabase db query` output is JSON with a `rows` array when `-o json` is passed.

## 5. Known gaps and notes
- **Find a Team fit ranking** (spec §4.1 "Recommended for You") is not implemented; the recruiting list is unranked. Not in the P4-B request; candidate for P5 polish using `scoreTeam(members ∪ {me})`.
- `match_runs` is not written (P4-B is read-only by request). P5 can record a run when invitations are sent.
- Explanations are deterministic templates. LLM wording is P6.
- Baseline on the demo data is strong (0.871 vs 0.895) because individual ranking already rewards role complementarity with the user; the constructed unit test shows the larger gap.
- Dev helper: `npx tsx --conditions=react-server scripts/dev-match-probe.ts jordan form` / `alex grow` (local DB only).
- Local Postgres is 15 (cloud 17); migration 0008 uses nothing version-specific.
- Production still holds tagged test Spaces/teams from earlier verification; deletion needs the owner's approval.

## 6. For P5 (next phase, not started)
- Migration timestamp must be later than `20261114000008`.
- `send_invitations` should re-validate with the same rules as `get_match_pool` (consent, membership, capacity incl. pending) and may accept the candidate ids from a Smart/Grow proposal.
- Capacity trigger `team_members_enforce_capacity` and the one-team-per-Space unique index already protect acceptance races.
- Seeded demo teams are `active`/`draft`; `forming` appears once invitations exist.

## 7. Deployment record (completed Sat 2026-11-14 ~22:00 PST)
- Migration `20261114000008_matching.sql` applied to Supabase `qhfmvsfnhdqfupvggzco` after a dry run listing only that file (two functions + grants, no data writes). Cloud audit: no violations; schema linter clean; `get_match_pool` is `STABLE`, `search_path=""`, executable by `authenticated` only.
- Cloud demo sandbox (slot 0) re-seeded: 44 personas, 3 Spaces, 54 participations, 5 teams.
- Deployed to Vercel project `trojanmatch` (deployment `trojanmatch-h7k4q3qd7`) at https://trojanmatch-jade.vercel.app. `my-portfolio` untouched.
- Production browser tests at 1440px and 375px: demo suite 11 passed / 1 skipped by design (includes the P4-B A–H flow), P1 14/14, P4-A 2/2; cloud permissions probe all pass.
- Production data digests (Spaces, participations, profiles, teams, members, production users' rate-limit events) were identical to the pre-deployment baseline; the only additions were two tagged test Spaces/teams created on purpose by the P4-A regression run (tag `Exxvvao`). Existing tagged test Spaces were not deleted.
- Test-only fix: `tests/e2e/p1-auth-shell.spec.ts` now accepts either the empty My Teams state or a team list (dev1 owns tagged teams in production, which the old assertion did not expect).
