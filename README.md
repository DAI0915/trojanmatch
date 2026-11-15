# TrojanMatch

*Build better teams. Start building sooner.* AI recommends. Humans decide.

AI-assisted team formation for USC students, scoped to a specific hackathon edition or
course assignment (a **Matching Space**). Not an official USC app.

- Spec (source of truth): [`docs/TrojanMatch_Final_Spec.md`](docs/TrojanMatch_Final_Spec.md)
- Architecture & phase plan: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)

## Stack
Next.js 16 (App Router, `proxy.ts`) · TypeScript · Tailwind v4 · shadcn/ui (base-ui) ·
Supabase (Postgres, Auth, Realtime, RLS) · Gemini (server-side) · Vitest · Playwright · Vercel

## Local development
```bash
npm install
npx supabase start -x studio,edge-runtime,logflare,vector,storage-api,imgproxy,postgres-meta
# create .env.local from `npx supabase status -o env` (see .env.example)
npm run dev-users          # two CONFIRMED dev accounts (admin API, no email needed)
npm run dev
```

## Quality gates (run at every phase boundary)
```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run db:lint            # Supabase schema linter
npx playwright test        # browser checks at 1440px and 375px
```
`npm test` runs unit tests plus integration tests against **local** Supabase only
(real JWTs, direct PostgREST/RPC calls, and a catalog-level security audit).

## Security model (summary)
- Scope isolation (`prod` vs `demo:<n>`) and Space isolation enforced in Postgres (RLS,
  composite FKs, partial unique indexes); writes to Spaces/teams/invitations are RPC-only.
- Every `SECURITY DEFINER` function pins `search_path=''`; EXECUTE is revoked by default
  and granted explicitly; helpers live in the non-exposed `private` schema.
- Email confirmation is ON. Public sign-up stays disabled (`PUBLIC_SIGNUP_ENABLED=false`)
  until custom SMTP is configured. A confirmed email is never presented as proof of
  student status.
