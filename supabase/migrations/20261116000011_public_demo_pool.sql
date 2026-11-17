-- TrojanMatch 0011 — Password-free public demo: a POOL of isolated sandbox slots.
--
-- Replaces the single shared presenter slot (any start reset everyone) with
-- per-visitor leases on slots 1..N. Each slot is its own scope 'demo:<n>' with
-- its own ~44 synthetic personas, so visitors never see, reset or invalidate
-- each other. Slot 0 (legacy presenter) is left untouched and is not pooled.
--
-- Safety model (unchanged from 0005):
--   * Every slot is turned into a scope by private.demo_scope(), which can only
--     return 'demo:0'..'demo:20' — never 'prod'.
--   * Administration functions are EXECUTE service_role only.
--   * Signed-in users can only ask about / touch THEIR OWN slot's lease
--     (slot derived from their own profile scope, never from input).
--   * No writes to auth.* tables.
--
-- This migration only ADDS columns/functions and REPLACES the bodies of two
-- lease checks (same signatures and grants). No data is deleted.

alter table private.demo_slots
  add column holder_subject text,          -- salted IP hash of the visitor (never a raw IP)
  add column started_at     timestamptz,
  add column last_seen_at   timestamptz;

-- A lease is ACTIVE while its token is set, it hasn't hit its hard expiry, and
-- the visitor was seen in the last 30 minutes (idle sessions free the slot).
create function private.demo_lease_active(d private.demo_slots)
returns boolean
language sql
stable
set search_path = ''
as $$
  select d.lease_token_hash is not null
     and d.leased_until is not null
     and d.leased_until > pg_catalog.now()
     and coalesce(d.last_seen_at, d.updated_at) > pg_catalog.now() - interval '30 minutes'
$$;

-- ---------------------------------------------------------------------------
-- Lease checks (bodies replaced; signatures + grants unchanged)
-- ---------------------------------------------------------------------------

-- Service role: is this token the current, active lease of p_slot?
create or replace function public.demo_check_lease(p_slot integer, p_token_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_d private.demo_slots;
begin
  perform private.demo_scope(p_slot);
  select * into v_d from private.demo_slots d where d.slot = p_slot;
  if not found or v_d.lease_token_hash is distinct from p_token_hash or not private.demo_lease_active(v_d) then
    return pg_catalog.jsonb_build_object('valid', false);
  end if;
  return pg_catalog.jsonb_build_object(
    'valid', true, 'leased_until', v_d.leased_until, 'epoch', v_d.epoch,
    'idle_until', coalesce(v_d.last_seen_at, v_d.updated_at) + interval '30 minutes');
end
$$;

-- Signed-in demo user (proxy.ts, every request): is MY slot's lease this token?
-- Also records activity (at most once a minute) so idle slots can be reclaimed.
-- Prod users always get false and nothing is written.
create or replace function public.demo_lease_valid(p_token_hash text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_scope text := private.current_scope();
  v_slot  smallint;
  v_d     private.demo_slots;
begin
  if auth.uid() is null or v_scope is null or v_scope !~ '^demo:[0-9]{1,2}$' then
    return false;
  end if;
  v_slot := pg_catalog.substr(v_scope, 6)::smallint;
  select * into v_d from private.demo_slots d where d.slot = v_slot;
  if not found or v_d.lease_token_hash is distinct from p_token_hash or not private.demo_lease_active(v_d) then
    return false;
  end if;
  update private.demo_slots d
     set last_seen_at = pg_catalog.now()
   where d.slot = v_slot
     and d.lease_token_hash = p_token_hash
     and (d.last_seen_at is null or d.last_seen_at < pg_catalog.now() - interval '1 minute');
  return true;
end
$$;

-- ---------------------------------------------------------------------------
-- Pool administration (service role only)
-- ---------------------------------------------------------------------------

-- Lease a free slot in 1..p_max_slot for a new visitor. Serialized with an
-- advisory lock so two visitors can never receive the same slot. A slot is
-- eligible only if its synthetic personas are registered (seeded).
create function public.demo_acquire_slot(
  p_max_slot integer, p_token_hash text, p_minutes integer, p_subject text, p_max_per_subject integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slot   smallint;
  v_until  timestamptz;
  v_epoch  integer;
  v_retry  timestamptz;
begin
  if p_max_slot is null or p_max_slot not between 1 and 20 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: pool size must be 1–20.';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: bad token hash.';
  end if;
  if p_minutes is null or p_minutes not between 5 and 240 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: lease length must be 5–240 minutes.';
  end if;
  if p_subject is null or p_subject !~ '^demo:[0-9a-f]{32}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: bad subject.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('trojanmatch.demo_acquire_slot'));

  insert into private.demo_slots (slot)
  select g::smallint from pg_catalog.generate_series(1, p_max_slot) g
   where exists (select 1 from private.demo_personas dp where dp.slot = g and dp.persona_key = 'jordan')
  on conflict (slot) do nothing;

  if (select pg_catalog.count(*) from private.demo_slots d
       where d.slot between 1 and p_max_slot and d.holder_subject = p_subject
         and private.demo_lease_active(d)) >= greatest(coalesce(p_max_per_subject, 2), 1) then
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'TOO_MANY_SESSIONS');
  end if;

  select d.slot into v_slot
    from private.demo_slots d
   where d.slot between 1 and p_max_slot
     and exists (select 1 from private.demo_personas dp where dp.slot = d.slot and dp.persona_key = 'jordan')
     and not private.demo_lease_active(d)
   order by d.updated_at, d.slot
   limit 1
   for update;

  if v_slot is null then
    select pg_catalog.min(least(d.leased_until, coalesce(d.last_seen_at, d.updated_at) + interval '30 minutes'))
      into v_retry
      from private.demo_slots d
     where d.slot between 1 and p_max_slot and private.demo_lease_active(d);
    return pg_catalog.jsonb_build_object('ok', false, 'error', 'BUSY', 'retry_at', v_retry);
  end if;

  v_until := pg_catalog.now() + pg_catalog.make_interval(mins => p_minutes);
  update private.demo_slots d
     set lease_token_hash = p_token_hash, leased_until = v_until, holder_subject = p_subject,
         started_at = pg_catalog.now(), last_seen_at = pg_catalog.now(),
         epoch = d.epoch + 1, updated_at = pg_catalog.now()
   where d.slot = v_slot
  returning d.epoch into v_epoch;

  return pg_catalog.jsonb_build_object('ok', true, 'slot', v_slot, 'leased_until', v_until, 'epoch', v_epoch);
end
$$;

-- Restart: the CURRENT holder extends their own active lease (same token).
create function public.demo_renew_lease(p_slot integer, p_token_hash text, p_minutes integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d     private.demo_slots;
  v_until timestamptz;
begin
  perform private.demo_scope(p_slot);
  if p_minutes is null or p_minutes not between 5 and 240 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: lease length must be 5–240 minutes.';
  end if;
  select * into v_d from private.demo_slots d where d.slot = p_slot for update;
  if not found or v_d.lease_token_hash is distinct from p_token_hash or not private.demo_lease_active(v_d) then
    return pg_catalog.jsonb_build_object('valid', false);
  end if;
  v_until := pg_catalog.now() + pg_catalog.make_interval(mins => p_minutes);
  update private.demo_slots d
     set leased_until = v_until, last_seen_at = pg_catalog.now(), updated_at = pg_catalog.now()
   where d.slot = p_slot;
  return pg_catalog.jsonb_build_object('valid', true, 'leased_until', v_until);
end
$$;

-- ---------------------------------------------------------------------------
-- Gemini budget for demo sandboxes. Production users are unaffected (true,
-- nothing recorded). Demo users: at most 4 Gemini kickoffs per VISITOR LEASE
-- (slot + lease epoch, so a new visitor reusing a slot gets a fresh budget) per
-- hour, and 60 across ALL demo sandboxes per 24 h; beyond that the app uses the
-- deterministic template. Counted in private.api_events, which sandbox restarts
-- do NOT clear (and a restart keeps the same lease), so restarting doesn't
-- refill the budget.
-- ---------------------------------------------------------------------------
create function public.demo_ai_quota_take()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_scope   text := private.current_scope();
  v_epoch   integer;
  v_subject text;
begin
  if auth.uid() is null or v_scope is null then
    return false;
  end if;
  if v_scope !~ '^demo:[0-9]{1,2}$' then
    return true;
  end if;
  select d.epoch into v_epoch from private.demo_slots d where d.slot = pg_catalog.substr(v_scope, 6)::smallint;
  v_subject := v_scope || '#' || coalesce(v_epoch, 0)::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('trojanmatch.demo_ai_quota'));
  if (select pg_catalog.count(*) from private.api_events e
       where e.subject = v_subject and e.kind = 'demo_ai_kickoff'
         and e.created_at > pg_catalog.now() - interval '1 hour') >= 4
     or (select pg_catalog.count(*) from private.api_events e
          where e.kind = 'demo_ai_kickoff'
            and e.created_at > pg_catalog.now() - interval '24 hours') >= 60 then
    return false;
  end if;
  insert into private.api_events (subject, kind) values (v_subject, 'demo_ai_kickoff');
  return true;
end
$$;

create index if not exists api_events_kind_created_idx on private.api_events (kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.demo_lease_active(private.demo_slots)                    from public, anon, authenticated;
revoke all on function public.demo_acquire_slot(integer, text, integer, text, integer) from public, anon, authenticated;
revoke all on function public.demo_renew_lease(integer, text, integer)                 from public, anon, authenticated;
revoke all on function public.demo_ai_quota_take()                                     from public, anon, authenticated;

grant execute on function public.demo_acquire_slot(integer, text, integer, text, integer) to service_role;
grant execute on function public.demo_renew_lease(integer, text, integer)                 to service_role;
-- Signed-in users may only take from THEIR OWN scope's AI budget.
grant execute on function public.demo_ai_quota_take() to authenticated;
-- demo_lease_valid / demo_check_lease keep their grants (CREATE OR REPLACE).
