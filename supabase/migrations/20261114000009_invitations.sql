-- TrojanMatch 0009 — Invitations, join requests, acceptance and activation (P5).
--
-- "AI recommends. Humans decide." Every state change here is an explicit user
-- action; generating or replacing a proposal never sends anything.
--
-- Adds (no table, column, policy or existing row is changed):
--   * private.invite_ttl()            invitation lifetime (app_config, default 48h)
--   * private.evaluate_team(team)     auto-activation / forming / full bookkeeping
--   * private.expire_stale_invites()  lazy expiry (teams locked in id order)
--   * public.send_invitations         recruiter invites eligible candidates
--   * public.start_team_with_invitations  create team + invites atomically (Smart)
--   * public.request_to_join          student asks to join a recruiting team
--   * public.respond_invitation       accept / decline (invitee, or recruiter for requests)
--   * public.cancel_invitation        team cancels an invite / student withdraws a request
--   * public.finalize_team            owner-only early activation
--   * public.refresh_invitations      lazy expiry for everything the caller can see
--   * public.find_teams               Find a Team search (filters in SQL)
-- Replaces (CREATE OR REPLACE, same signature + grants):
--   * public.get_match_pool           also excludes students who DECLINED this
--                                     team's invitation, and ignores expired
--                                     pending invitations (consistent with send)
--   * public.demo_clear_create_limits also clears the new demo personas' team /
--                                     invitation limits (still slot + synthetic only)
--
-- Invariants (enforced here, not in the app):
--   * one accepted team per user per Space     → unique index + respond checks
--   * accepted members ≤ target size           → capacity trigger (0007) + checks
--   * accepted + pending invitations ≤ target  → send_invitations (invites reserve seats)
--   * a team becomes active only when accepted ≥ max(min_team_size, 2) and no
--     outbound invitation is still pending (auto), or when its OWNER finalizes
--   * expired invitations can never be accepted
--   * every function that changes a team locks the team row(s) first, in id order,
--     so concurrent accept / finalize / cancel / expire serialize without deadlocks

insert into private.app_config (key, value) values ('invite_ttl_hours', '48'::jsonb)
on conflict (key) do nothing;

create function private.invite_ttl()
returns interval
language sql
stable
set search_path = ''
as $$
  select pg_catalog.make_interval(hours => coalesce((
    select (c.value #>> '{}')::integer from private.app_config c
    where c.key = 'invite_ttl_hours' and (c.value #>> '{}') ~ '^[0-9]{1,4}$'), 48))
$$;

-- ---------------------------------------------------------------------------
-- evaluate_team — called (with the team row locked) after every change.
--   full (accepted ≥ target)           → stop recruiting, close remaining pending
--   draft/forming, accepted ≥ min, no pending invites → active (auto)
--   draft/forming with pending invites or > 1 member  → forming
--   otherwise                                          → draft
-- Active teams stay active while they keep growing.
-- ---------------------------------------------------------------------------
create function private.evaluate_team(p_team_id uuid)
returns public.team_status
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_t        public.teams;
  v_min      integer;
  v_accepted integer;
  v_pending  integer;
  v_status   public.team_status;
  v_full     boolean;
begin
  select * into v_t from public.teams t where t.id = p_team_id for update;
  if not found or v_t.status = 'archived' then
    return v_t.status;
  end if;
  select greatest(s.min_team_size, 2) into v_min from public.matching_spaces s where s.id = v_t.space_id;
  select pg_catalog.count(*) into v_accepted
  from public.team_members tm where tm.team_id = v_t.id and tm.status = 'active';
  v_full := v_accepted >= v_t.target_size;

  if v_full then
    update public.invitations i
       set status = 'cancelled', status_reason = 'team_full'
     where i.team_id = v_t.id and i.status = 'pending';
  end if;

  select pg_catalog.count(*) into v_pending
  from public.invitations i where i.team_id = v_t.id and i.kind = 'invite' and i.status = 'pending';

  v_status := v_t.status;
  if v_t.status in ('draft', 'forming') then
    if v_accepted >= v_min and v_pending = 0 then
      v_status := 'active';
    elsif v_pending > 0 or v_accepted > 1 then
      v_status := 'forming';
    else
      v_status := 'draft';
    end if;
  end if;

  if v_status is distinct from v_t.status or (v_full and v_t.recruiting) then
    update public.teams t
       set status = v_status,
           activation_mode = case when v_status = 'active' and v_t.status <> 'active' then 'auto'::public.activation_mode else t.activation_mode end,
           activated_at    = case when v_status = 'active' and v_t.status <> 'active' then pg_catalog.now() else t.activated_at end,
           recruiting      = case when v_full then false else t.recruiting end
     where t.id = v_t.id;
  end if;
  return v_status;
end
$$;

-- ---------------------------------------------------------------------------
-- Lazy expiry: pending invitations/requests past expires_at become 'expired'.
-- Locks the affected teams in id order first (same order every writer uses).
-- ---------------------------------------------------------------------------
create function private.expire_stale_invites(p_team_ids uuid[])
returns integer
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_teams uuid[];
  v_id    uuid;
  v_n     integer;
begin
  v_teams := array(
    select distinct i.team_id from public.invitations i
    where i.team_id = any(p_team_ids) and i.status = 'pending' and i.expires_at <= pg_catalog.now()
    order by 1);
  if pg_catalog.cardinality(v_teams) = 0 then
    return 0;
  end if;
  perform 1 from public.teams t where t.id = any(v_teams) order by t.id for update;
  update public.invitations i
     set status = 'expired', status_reason = 'ttl'
   where i.team_id = any(v_teams) and i.status = 'pending' and i.expires_at <= pg_catalog.now();
  get diagnostics v_n = row_count;
  foreach v_id in array v_teams loop
    perform private.evaluate_team(v_id);
  end loop;
  return v_n;
end
$$;

-- Recruiter check (owner or delegated recruiter, accepted member).
create function private.is_recruiter(p_team_id uuid, p_user_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = p_user_id and tm.status = 'active'
      and (tm.role = 'owner' or tm.can_recruit))
$$;

-- ---------------------------------------------------------------------------
-- send_invitations — explicit recruiter action. Re-validates every candidate
-- with the same rules as get_match_pool at the moment of sending (consent,
-- same Space + scope, not on a team, no pending invite/request, has not
-- declined this team) and checks capacity including pending invitations.
-- All-or-nothing: if any candidate is no longer valid, nothing is sent.
-- ---------------------------------------------------------------------------
create function public.send_invitations(p_team_id uuid, p_user_ids uuid[], p_message text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_scope    text := private.current_scope();
  v_t        public.teams;
  v_s        public.matching_spaces;
  v_ids      uuid[];
  v_msg      text := nullif(pg_catalog.btrim(p_message), '');
  v_accepted integer;
  v_pending  integer;
  v_id       uuid;
  v_pa       public.participations;
  v_label    text;
  v_kind     public.invite_kind;
  v_inv_id   uuid;
  v_expires  timestamptz := pg_catalog.now() + private.invite_ttl();
  v_sent     jsonb := '[]'::jsonb;
  v_status   public.team_status;
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;

  select t.* into v_t
  from public.teams t
  join public.matching_spaces s on s.id = t.space_id
  where t.id = p_team_id and s.scope = v_scope
  for update of t;
  if not found or not private.is_recruiter(v_t.id, v_uid) then
    raise exception using errcode = 'P0001', message = 'NOT_RECRUITER: You can only invite people to teams you recruit for.';
  end if;
  if v_t.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: This team is closed.';
  end if;
  select * into v_s from public.matching_spaces s where s.id = v_t.space_id;
  if v_s.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: Team formation is closed for this Space.';
  end if;
  if v_s.team_deadline_at is not null and v_s.team_deadline_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'DEADLINE_PASSED: The team formation deadline has passed.';
  end if;

  v_ids := array(select distinct u from pg_catalog.unnest(coalesce(p_user_ids, '{}'::uuid[])) u where u is not null order by 1);
  if pg_catalog.cardinality(v_ids) = 0 or pg_catalog.cardinality(v_ids) > 10 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Choose between 1 and 10 people to invite.';
  end if;
  if v_msg is not null and pg_catalog.char_length(v_msg) > 280 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: The message must be at most 280 characters.';
  end if;
  perform private.rate_limit_hit(v_uid::text, 'send_invitations', 30, interval '1 hour');
  perform private.expire_stale_invites(array[v_t.id]);

  select pg_catalog.count(*) into v_accepted
  from public.team_members tm where tm.team_id = v_t.id and tm.status = 'active';
  select pg_catalog.count(*) into v_pending
  from public.invitations i where i.team_id = v_t.id and i.kind = 'invite' and i.status = 'pending';
  if v_accepted + v_pending + pg_catalog.cardinality(v_ids) > v_t.target_size then
    raise exception using errcode = 'P0001', message = pg_catalog.format(
      'TEAM_FULL: Only %s open position%s left (%s accepted, %s invited, team size %s).',
      greatest(v_t.target_size - v_accepted - v_pending, 0),
      case when v_t.target_size - v_accepted - v_pending = 1 then '' else 's' end,
      v_accepted, v_pending, v_t.target_size);
  end if;

  foreach v_id in array v_ids loop
    if v_id = v_uid then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: You can''t invite yourself.';
    end if;
    select pa.* into v_pa
    from public.participations pa
    join public.profiles p on p.id = pa.user_id
    where pa.space_id = v_s.id and pa.user_id = v_id and p.scope = v_scope;
    if not found then
      raise exception using errcode = 'P0001', message = 'INVITE_NO_LONGER_VALID: Someone you selected is not a participant of this Space.';
    end if;
    -- Never reveal a hidden student's name in an error.
    select case when v_pa.visible_to_members then p.display_name else 'Someone you selected' end into v_label
    from public.profiles p where p.id = v_id;

    if exists (
      select 1 from public.team_members tm
      where tm.space_id = v_s.id and tm.user_id = v_id and tm.status = 'active'
    ) then
      raise exception using errcode = 'P0001', message = pg_catalog.format('INVITE_NO_LONGER_VALID: %s has already joined a team in this Space.', v_label);
    end if;
    if not (v_pa.visible_to_members and v_pa.accept_invites and v_pa.smart_match_opt_in and v_pa.looking_for_team) then
      raise exception using errcode = 'P0001', message = pg_catalog.format('INVITE_NO_LONGER_VALID: %s is not accepting invitations right now.', v_label);
    end if;
    select i.kind into v_kind from public.invitations i
    where i.team_id = v_t.id and i.user_id = v_id and i.status = 'pending';
    if found then
      if v_kind = 'invite' then
        raise exception using errcode = 'P0001', message = pg_catalog.format('DUPLICATE_PENDING: %s already has a pending invitation from this team.', v_label);
      end if;
      raise exception using errcode = 'P0001', message = pg_catalog.format('DUPLICATE_PENDING: %s already asked to join this team. Review their request instead.', v_label);
    end if;
    if exists (
      select 1 from public.invitations i
      where i.team_id = v_t.id and i.user_id = v_id and i.kind = 'invite' and i.status = 'declined'
    ) then
      raise exception using errcode = 'P0001', message = pg_catalog.format('INVITE_NO_LONGER_VALID: %s already declined an invitation from this team.', v_label);
    end if;

    insert into public.invitations (space_id, team_id, kind, user_id, actor_id, status, message, expires_at)
    values (v_s.id, v_t.id, 'invite', v_id, v_uid, 'pending', v_msg, v_expires)
    returning id into v_inv_id;
    v_sent := v_sent || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('invitation_id', v_inv_id, 'user_id', v_id));
  end loop;

  v_status := private.evaluate_team(v_t.id);
  return pg_catalog.jsonb_build_object(
    'team_id', v_t.id, 'space_id', v_s.id, 'team_status', v_status, 'sent', v_sent, 'expires_at', v_expires);
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_PENDING: One of these people already has a pending invitation from this team.';
end
$$;

-- ---------------------------------------------------------------------------
-- start_team_with_invitations — Smart Team Formation without a team yet:
-- creates the team (same rules as create_team) and sends the invitations in
-- ONE transaction, so a failed invite never leaves an orphan team behind.
-- ---------------------------------------------------------------------------
create function public.start_team_with_invitations(p_space_id uuid, p_team jsonb, p_user_ids uuid[], p_message text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_team jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;
  v_team := public.create_team(p_space_id, p_team);
  return public.send_invitations((v_team ->> 'team_id')::uuid, p_user_ids, p_message)
         || pg_catalog.jsonb_build_object('created_team', true);
end
$$;

-- ---------------------------------------------------------------------------
-- request_to_join — a participant asks to join a recruiting team (Find a Team).
-- Requests do not reserve a seat; pending invitations do.
-- ---------------------------------------------------------------------------
create function public.request_to_join(p_team_id uuid, p_message text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_scope    text := private.current_scope();
  v_t        public.teams;
  v_s        public.matching_spaces;
  v_msg      text := nullif(pg_catalog.btrim(p_message), '');
  v_accepted integer;
  v_pending  integer;
  v_kind     public.invite_kind;
  v_inv_id   uuid;
  v_expires  timestamptz := pg_catalog.now() + private.invite_ttl();
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;

  select t.* into v_t
  from public.teams t
  join public.matching_spaces s on s.id = t.space_id
  where t.id = p_team_id and s.scope = v_scope
  for update of t;
  -- Same answer whether the team is missing or in a Space you haven't joined.
  if not found or not exists (
    select 1 from public.participations pa where pa.space_id = v_t.space_id and pa.user_id = v_uid
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND: Team not found.';
  end if;
  select * into v_s from public.matching_spaces s where s.id = v_t.space_id;
  if v_s.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: Team formation is closed for this Space.';
  end if;
  if v_s.team_deadline_at is not null and v_s.team_deadline_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'DEADLINE_PASSED: The team formation deadline has passed.';
  end if;
  if exists (
    select 1 from public.team_members tm where tm.space_id = v_s.id and tm.user_id = v_uid and tm.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_IN_TEAM: You are already on a team in this Space.';
  end if;
  if v_t.status = 'archived' or not v_t.recruiting then
    raise exception using errcode = 'P0001', message = 'TEAM_FULL: This team is not recruiting right now.';
  end if;
  if v_msg is not null and pg_catalog.char_length(v_msg) > 280 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: The message must be at most 280 characters.';
  end if;

  perform private.expire_stale_invites(array[v_t.id]);
  select i.kind into v_kind from public.invitations i
  where i.team_id = v_t.id and i.user_id = v_uid and i.status = 'pending';
  if found then
    if v_kind = 'invite' then
      raise exception using errcode = 'P0001', message = 'DUPLICATE_PENDING: This team already invited you. Open Invitations to respond.';
    end if;
    raise exception using errcode = 'P0001', message = 'DUPLICATE_PENDING: You already asked to join this team.';
  end if;
  if (
    select pg_catalog.count(*) from public.invitations i
    where i.space_id = v_s.id and i.user_id = v_uid and i.kind = 'request' and i.status = 'pending'
  ) >= 3 then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED: You can have at most 3 pending join requests in a Space. Withdraw one first.';
  end if;

  select pg_catalog.count(*) into v_accepted
  from public.team_members tm where tm.team_id = v_t.id and tm.status = 'active';
  select pg_catalog.count(*) into v_pending
  from public.invitations i where i.team_id = v_t.id and i.kind = 'invite' and i.status = 'pending';
  if v_accepted + v_pending >= v_t.target_size then
    raise exception using errcode = 'P0001', message = 'TEAM_FULL: All open positions on this team are taken or reserved.';
  end if;

  perform private.rate_limit_hit(v_uid::text, 'request_to_join', 20, interval '1 hour');
  insert into public.invitations (space_id, team_id, kind, user_id, actor_id, status, message, expires_at)
  values (v_s.id, v_t.id, 'request', v_uid, v_uid, 'pending', v_msg, v_expires)
  returning id into v_inv_id;

  return pg_catalog.jsonb_build_object('invitation_id', v_inv_id, 'team_id', v_t.id, 'expires_at', v_expires);
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_PENDING: You already have a pending request or invitation for this team.';
end
$$;

-- ---------------------------------------------------------------------------
-- respond_invitation — accept or decline.
--   invite  → only the invited student may respond
--   request → only the team's owner / recruiters may respond
-- Accept: Space open and before deadline, joiner not on another team (an own
-- solo draft team may be closed with p_leave_solo_draft), capacity (requests
-- may not take a seat reserved by a pending invitation). The joiner's other
-- pending invitations/requests in the Space expire (joined_other_team).
-- ---------------------------------------------------------------------------
create function public.respond_invitation(p_invitation_id uuid, p_accept boolean, p_leave_solo_draft boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_scope     text := private.current_scope();
  v_inv       public.invitations;
  v_t         public.teams;
  v_s         public.matching_spaces;
  v_joiner    uuid;
  v_solo      public.teams;
  v_lock      uuid[];
  v_accepted  integer;
  v_reserved  integer;
  v_status    public.team_status;
  v_was       public.team_status;
  v_other     uuid;
  v_others    uuid[];
  v_noun      text;
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;
  if p_accept is null then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Choose accept or decline.';
  end if;

  select i.* into v_inv
  from public.invitations i
  join public.matching_spaces s on s.id = i.space_id
  where i.id = p_invitation_id and s.scope = v_scope;
  if not found
     or (v_inv.kind = 'invite' and v_inv.user_id <> v_uid)
     or (v_inv.kind = 'request' and not private.is_recruiter(v_inv.team_id, v_uid)) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND: Invitation not found.';
  end if;
  v_joiner := v_inv.user_id;
  v_noun := case when v_inv.kind = 'invite' then 'invitation' else 'request' end;

  -- The joiner's own solo team (owner, nobody else accepted yet) — may be closed on accept.
  if p_accept and v_inv.kind = 'invite' then
    select t.* into v_solo
    from public.teams t
    join public.team_members tm on tm.team_id = t.id
    where t.space_id = v_inv.space_id and t.id <> v_inv.team_id and t.status in ('draft', 'forming')
      and tm.user_id = v_joiner and tm.status = 'active' and tm.role = 'owner'
      and (select pg_catalog.count(*) from public.team_members x where x.team_id = t.id and x.status = 'active') = 1;
  end if;

  -- Lock every team this response can touch, in id order (no deadlocks).
  v_lock := array(
    select distinct x from pg_catalog.unnest(
      array[v_inv.team_id, v_solo.id]
      || array(select i.team_id from public.invitations i
               where i.space_id = v_inv.space_id and i.user_id = v_joiner and i.status = 'pending')) x
    where x is not null order by 1);
  perform 1 from public.teams t where t.id = any(v_lock) order by t.id for update;

  select * into v_inv from public.invitations i where i.id = p_invitation_id for update;
  select * into v_t from public.teams t where t.id = v_inv.team_id;
  select * into v_s from public.matching_spaces s where s.id = v_inv.space_id;
  v_was := v_t.status;

  if v_inv.status <> 'pending' then
    raise exception using errcode = 'P0001',
      message = pg_catalog.format('INVITE_NO_LONGER_VALID: This %s was already %s.', v_noun, v_inv.status);
  end if;
  if v_inv.expires_at <= pg_catalog.now() then
    update public.invitations i set status = 'expired', status_reason = 'ttl' where i.id = v_inv.id;
    v_status := private.evaluate_team(v_t.id);
    return pg_catalog.jsonb_build_object(
      'outcome', 'expired', 'reason', 'ttl', 'invitation_id', v_inv.id, 'team_id', v_t.id, 'team_status', v_status);
  end if;

  if not p_accept then
    update public.invitations i
       set status = 'declined', responded_by = v_uid, responded_at = pg_catalog.now()
     where i.id = v_inv.id;
    v_status := private.evaluate_team(v_t.id);
    return pg_catalog.jsonb_build_object(
      'outcome', 'declined', 'invitation_id', v_inv.id, 'team_id', v_t.id, 'space_id', v_s.id,
      'team_status', v_status, 'activated', v_status = 'active' and v_was <> 'active');
  end if;

  -- ---- accept ----
  if v_s.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: Team formation is closed for this Space.';
  end if;
  if v_s.team_deadline_at is not null and v_s.team_deadline_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'DEADLINE_PASSED: The team formation deadline has passed.';
  end if;
  if v_t.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'INVITE_NO_LONGER_VALID: This team was closed.';
  end if;

  if exists (
    select 1 from public.team_members tm
    where tm.space_id = v_s.id and tm.user_id = v_joiner and tm.status = 'active'
  ) then
    if v_solo.id is not null and exists (
      select 1 from public.team_members tm where tm.team_id = v_solo.id and tm.user_id = v_joiner and tm.status = 'active'
    ) then
      if not coalesce(p_leave_solo_draft, false) then
        raise exception using errcode = 'P0001', message = pg_catalog.format(
          'OWN_DRAFT_TEAM: You own “%s”, which has no other members yet. Accepting closes that team and cancels its pending invitations.', v_solo.name);
      end if;
      update public.invitations i set status = 'cancelled', status_reason = 'team_closed'
       where i.team_id = v_solo.id and i.status = 'pending';
      update public.team_members tm set status = 'left', left_at = pg_catalog.now()
       where tm.team_id = v_solo.id and tm.user_id = v_joiner;
      update public.teams t set status = 'archived', recruiting = false where t.id = v_solo.id;
    elsif v_inv.kind = 'request' then
      -- The requester joined another team meanwhile: the request can no longer be used.
      update public.invitations i set status = 'expired', status_reason = 'joined_other_team' where i.id = v_inv.id;
      return pg_catalog.jsonb_build_object(
        'outcome', 'expired', 'reason', 'joined_other_team', 'invitation_id', v_inv.id, 'team_id', v_t.id,
        'team_status', v_t.status);
    else
      raise exception using errcode = 'P0001',
        message = 'CONFLICT_OTHER_TEAM: You are already on a team in this Space. You can only be on one team per Space.';
    end if;
  end if;

  select pg_catalog.count(*) into v_accepted
  from public.team_members tm where tm.team_id = v_t.id and tm.status = 'active';
  select pg_catalog.count(*) into v_reserved
  from public.invitations i where i.team_id = v_t.id and i.kind = 'invite' and i.status = 'pending' and i.id <> v_inv.id;
  if v_accepted >= v_t.target_size or (v_inv.kind = 'request' and v_accepted + v_reserved >= v_t.target_size) then
    raise exception using errcode = 'P0001', message = case when v_inv.kind = 'request'
      then 'TEAM_FULL: No open position is free (remaining seats are reserved by pending invitations).'
      else 'TEAM_FULL: This team has no open positions left.' end;
  end if;

  begin
    insert into public.team_members (team_id, space_id, user_id, role, can_recruit, status, joined_at, left_at)
    values (v_t.id, v_s.id, v_joiner, 'member', false, 'active', pg_catalog.now(), null)
    on conflict (team_id, user_id) do update
      set status = 'active', role = 'member', can_recruit = false, joined_at = pg_catalog.now(), left_at = null;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001',
        message = 'CONFLICT_OTHER_TEAM: You joined another team in this Space at the same moment. You can only be on one team per Space.';
  end;

  update public.invitations i
     set status = 'accepted', responded_by = v_uid, responded_at = pg_catalog.now()
   where i.id = v_inv.id;

  -- One team per Space: every other pending invitation/request for the joiner expires.
  with closed as (
    update public.invitations i
       set status = 'expired', status_reason = 'joined_other_team'
     where i.space_id = v_s.id and i.user_id = v_joiner and i.status = 'pending' and i.id <> v_inv.id
    returning i.team_id)
  select coalesce(pg_catalog.array_agg(distinct c.team_id order by c.team_id), '{}'::uuid[]) into v_others from closed c;
  foreach v_other in array v_others loop
    perform private.evaluate_team(v_other);
  end loop;

  v_status := private.evaluate_team(v_t.id);
  return pg_catalog.jsonb_build_object(
    'outcome', 'accepted', 'invitation_id', v_inv.id, 'team_id', v_t.id, 'space_id', v_s.id,
    'team_status', v_status, 'activated', v_status = 'active' and v_was <> 'active',
    'closed_team', v_solo.id);
end
$$;

-- ---------------------------------------------------------------------------
-- cancel_invitation — the team cancels a pending invite (owner/recruiter), or
-- the student withdraws a pending request. Accepted members are never touched.
-- ---------------------------------------------------------------------------
create function public.cancel_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_scope  text := private.current_scope();
  v_inv    public.invitations;
  v_status public.team_status;
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;
  select i.* into v_inv
  from public.invitations i
  join public.matching_spaces s on s.id = i.space_id
  where i.id = p_invitation_id and s.scope = v_scope;
  if not found
     or (v_inv.kind = 'invite' and not private.is_recruiter(v_inv.team_id, v_uid))
     or (v_inv.kind = 'request' and v_inv.user_id <> v_uid) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND: Invitation not found.';
  end if;

  perform 1 from public.teams t where t.id = v_inv.team_id for update;
  select * into v_inv from public.invitations i where i.id = p_invitation_id for update;
  if v_inv.status <> 'pending' then
    raise exception using errcode = 'P0001',
      message = pg_catalog.format('INVITE_NO_LONGER_VALID: This %s was already %s.',
        case when v_inv.kind = 'invite' then 'invitation' else 'request' end, v_inv.status);
  end if;
  update public.invitations i
     set status = 'cancelled',
         status_reason = case when v_inv.kind = 'invite' then 'cancelled_by_team' else 'withdrawn' end,
         responded_by = v_uid, responded_at = pg_catalog.now()
   where i.id = v_inv.id;
  v_status := private.evaluate_team(v_inv.team_id);
  return pg_catalog.jsonb_build_object('outcome', 'cancelled', 'invitation_id', v_inv.id, 'team_id', v_inv.team_id, 'team_status', v_status);
end
$$;

-- ---------------------------------------------------------------------------
-- finalize_team — OWNER-only early activation once the minimum is met.
-- Cancels pending outbound invitations (team_finalized). Pending join requests
-- stay only while the team still recruits with a free seat.
-- ---------------------------------------------------------------------------
create function public.finalize_team(p_team_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_scope     text := private.current_scope();
  v_t         public.teams;
  v_s         public.matching_spaces;
  v_min       integer;
  v_accepted  integer;
  v_cancelled integer;
  v_recruit   boolean;
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;
  select t.* into v_t
  from public.teams t
  join public.matching_spaces s on s.id = t.space_id
  where t.id = p_team_id and s.scope = v_scope
  for update of t;
  if not found or not exists (
    select 1 from public.team_members tm
    where tm.team_id = v_t.id and tm.user_id = v_uid and tm.status = 'active' and tm.role = 'owner'
  ) then
    raise exception using errcode = 'P0001', message = 'NOT_OWNER: Only the team owner can finalize the team.';
  end if;
  if v_t.status = 'active' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: This team is already active.';
  end if;
  if v_t.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: This team is closed.';
  end if;
  select * into v_s from public.matching_spaces s where s.id = v_t.space_id;
  if v_s.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: Team formation is closed for this Space.';
  end if;
  if v_s.team_deadline_at is not null and v_s.team_deadline_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'DEADLINE_PASSED: The team formation deadline has passed.';
  end if;

  perform private.expire_stale_invites(array[v_t.id]);
  v_min := greatest(v_s.min_team_size, 2);
  select pg_catalog.count(*) into v_accepted
  from public.team_members tm where tm.team_id = v_t.id and tm.status = 'active';
  if v_accepted < v_min then
    raise exception using errcode = 'P0001', message = pg_catalog.format(
      'BELOW_MIN_SIZE: A team needs at least %s accepted members to be finalized (it has %s).', v_min, v_accepted);
  end if;
  if v_accepted > least(v_t.target_size, v_s.max_team_size) then
    raise exception using errcode = 'P0001', message = 'TEAM_FULL: The team is larger than this Space allows.';
  end if;

  update public.invitations i
     set status = 'cancelled', status_reason = 'team_finalized', responded_by = v_uid, responded_at = pg_catalog.now()
   where i.team_id = v_t.id and i.kind = 'invite' and i.status = 'pending';
  get diagnostics v_cancelled = row_count;

  v_recruit := v_t.recruiting and v_accepted < v_t.target_size;
  if not v_recruit then
    update public.invitations i set status = 'cancelled', status_reason = 'team_full'
     where i.team_id = v_t.id and i.kind = 'request' and i.status = 'pending';
  end if;

  update public.teams t
     set status = 'active', activation_mode = 'finalized', activated_at = pg_catalog.now(), recruiting = v_recruit
   where t.id = v_t.id;

  return pg_catalog.jsonb_build_object(
    'team_id', v_t.id, 'team_status', 'active', 'members', v_accepted,
    'cancelled_invitations', v_cancelled, 'recruiting', v_recruit);
end
$$;

-- ---------------------------------------------------------------------------
-- refresh_invitations — lazy expiry for everything the caller can see (their
-- own invitations/requests and those of teams they are an accepted member of).
-- ---------------------------------------------------------------------------
create function public.refresh_invitations()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;
  return private.expire_stale_invites(array(
    select i.team_id from public.invitations i
    where i.status = 'pending' and i.expires_at <= pg_catalog.now()
      and (i.user_id = v_uid or exists (
        select 1 from public.team_members tm
        where tm.team_id = i.team_id and tm.user_id = v_uid and tm.status = 'active'))));
end
$$;

-- ---------------------------------------------------------------------------
-- find_teams — Find a Team. Recruiting teams in ONE Space the caller joined,
-- with filters evaluated in SQL. Only consenting (visible) members' matching
-- features are returned; shared hours are computed against those members only.
-- Filters (all optional): q, roles[], skills[], topics[], goal, min_shared_hours.
-- ---------------------------------------------------------------------------
create function public.find_teams(p_space_id uuid, p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_scope   text := private.current_scope();
  v_s       public.matching_spaces;
  f         jsonb := coalesce(p_filters, '{}'::jsonb);
  v_q       text;
  v_roles   text[];
  v_skills  text[];
  v_topics  text[];
  v_goal    text;
  v_hours   integer;
  v_my_av   smallint[];
  v_teams   jsonb;
  v_total   integer;
  k         text;
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;
  select * into v_s from public.matching_spaces s where s.id = p_space_id and s.scope = v_scope;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND: Space not found.';
  end if;
  if not exists (select 1 from public.participations pa where pa.space_id = v_s.id and pa.user_id = v_uid) then
    raise exception using errcode = 'P0001', message = 'NOT_PARTICIPANT: Join this Space to find a team.';
  end if;

  if pg_catalog.jsonb_typeof(f) <> 'object' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Filters must be an object.';
  end if;
  foreach k in array array['roles', 'skills', 'topics'] loop
    if f ? k and (pg_catalog.jsonb_typeof(f -> k) <> 'array' or pg_catalog.jsonb_array_length(f -> k) > 20
       or exists (select 1 from pg_catalog.jsonb_array_elements(f -> k) e
                  where pg_catalog.jsonb_typeof(e) <> 'string' or pg_catalog.char_length(e #>> '{}') > 30)) then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Invalid filter list.';
    end if;
  end loop;
  v_q      := nullif(pg_catalog.btrim(pg_catalog.left(f ->> 'q', 60)), '');
  v_roles  := array(select pg_catalog.jsonb_array_elements_text(coalesce(f -> 'roles', '[]'::jsonb)));
  v_skills := array(select pg_catalog.jsonb_array_elements_text(coalesce(f -> 'skills', '[]'::jsonb)));
  v_topics := array(select pg_catalog.jsonb_array_elements_text(coalesce(f -> 'topics', '[]'::jsonb)));
  v_goal   := nullif(f ->> 'goal', '');
  if f ? 'min_shared_hours' and pg_catalog.jsonb_typeof(f -> 'min_shared_hours') <> 'null' then
    if pg_catalog.jsonb_typeof(f -> 'min_shared_hours') <> 'number' or (f ->> 'min_shared_hours') !~ '^[0-9]{1,2}$' then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Minimum shared hours must be 0–40.';
    end if;
    v_hours := (f ->> 'min_shared_hours')::integer;
  end if;

  select coalesce(pa.availability_override, p.availability) into v_my_av
  from public.participations pa join public.profiles p on p.id = pa.user_id
  where pa.space_id = v_s.id and pa.user_id = v_uid;

  select pg_catalog.count(*) into v_total
  from public.teams t
  where t.space_id = v_s.id and t.recruiting and t.status <> 'archived'
    and not exists (select 1 from public.team_members tm where tm.team_id = t.id and tm.user_id = v_uid and tm.status = 'active');

  with base as (
    select t.*,
      (select pg_catalog.count(*) from public.team_members tm where tm.team_id = t.id and tm.status = 'active')::integer as accepted,
      (select pg_catalog.count(*) from public.invitations i
        where i.team_id = t.id and i.kind = 'invite' and i.status = 'pending' and i.expires_at > pg_catalog.now())::integer as reserved,
      array(
        select tm.user_id from public.team_members tm
        join public.participations pa on pa.space_id = tm.space_id and pa.user_id = tm.user_id
        where tm.team_id = t.id and tm.status = 'active' and pa.visible_to_members
        order by tm.joined_at, tm.user_id) as visible_ids
    from public.teams t
    where t.space_id = v_s.id and t.recruiting and t.status <> 'archived'
      and not exists (select 1 from public.team_members tm where tm.team_id = t.id and tm.user_id = v_uid and tm.status = 'active')
  ), scored as (
    select b.*,
      case when pg_catalog.cardinality(b.visible_ids) = 0 then null else (
        select pg_catalog.count(*)::integer from pg_catalog.unnest(coalesce(v_my_av, '{}'::smallint[])) h(hr)
        where not exists (
          select 1 from pg_catalog.unnest(b.visible_ids) m(uid)
          join public.participations pa on pa.space_id = v_s.id and pa.user_id = m.uid
          join public.profiles p on p.id = m.uid
          where not (h.hr = any(coalesce(pa.availability_override, p.availability)))))
      end as shared_hours
    from base b
    where b.accepted + b.reserved < b.target_size
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', sc.id, 'name', sc.name, 'description', sc.description, 'status', sc.status,
      'target_size', sc.target_size, 'members', sc.accepted, 'reserved', sc.reserved,
      'open_positions', sc.target_size - sc.accepted - sc.reserved,
      'requirements', sc.requirements, 'created_at', sc.created_at,
      'shared_hours', sc.shared_hours,
      'hidden_members', sc.accepted - pg_catalog.cardinality(sc.visible_ids),
      'member_profiles', (
        select coalesce(pg_catalog.jsonb_agg(private.match_person(v_s.id, m.uid)
          || pg_catalog.jsonb_build_object('team_role', (select tm.role from public.team_members tm where tm.team_id = sc.id and tm.user_id = m.uid))
          order by m.ord), '[]'::jsonb)
        from pg_catalog.unnest(sc.visible_ids) with ordinality m(uid, ord)),
      'my_request', (
        select pg_catalog.jsonb_build_object('id', i.id, 'expires_at', i.expires_at)
        from public.invitations i
        where i.team_id = sc.id and i.user_id = v_uid and i.kind = 'request' and i.status = 'pending' and i.expires_at > pg_catalog.now()),
      'my_invite', (
        select pg_catalog.jsonb_build_object('id', i.id, 'expires_at', i.expires_at)
        from public.invitations i
        where i.team_id = sc.id and i.user_id = v_uid and i.kind = 'invite' and i.status = 'pending' and i.expires_at > pg_catalog.now())
    ) order by sc.created_at desc, sc.id), '[]'::jsonb)
    into v_teams
  from scored sc
  where (v_q is null
         or pg_catalog.strpos(pg_catalog.lower(sc.name), pg_catalog.lower(v_q)) > 0
         or pg_catalog.strpos(pg_catalog.lower(coalesce(sc.description, '')), pg_catalog.lower(v_q)) > 0)
    and (pg_catalog.cardinality(v_roles) = 0
         or coalesce(sc.requirements -> 'must_roles', '[]'::jsonb) ?| v_roles
         or coalesce(sc.requirements -> 'preferred_roles', '[]'::jsonb) ?| v_roles)
    and (pg_catalog.cardinality(v_skills) = 0
         or coalesce(sc.requirements -> 'skills', '[]'::jsonb) ?| v_skills)
    and (pg_catalog.cardinality(v_topics) = 0
         or coalesce(sc.requirements -> 'topics', '[]'::jsonb) ?| v_topics
         or exists (
           select 1 from pg_catalog.unnest(sc.visible_ids) m(uid)
           join public.participations pa on pa.space_id = v_s.id and pa.user_id = m.uid
           join public.profiles p on p.id = m.uid
           where (case when pg_catalog.cardinality(pa.topics) > 0 then pa.topics else p.interests end) && v_topics))
    and (v_goal is null
         or (sc.requirements ->> 'goal') = v_goal
         or ((sc.requirements ->> 'goal') is null and exists (
           select 1 from pg_catalog.unnest(sc.visible_ids) m(uid)
           join public.participations pa on pa.space_id = v_s.id and pa.user_id = m.uid
           where pa.goal = v_goal)))
    and (v_hours is null or coalesce(sc.shared_hours, 0) >= v_hours);

  return pg_catalog.jsonb_build_object(
    'space', pg_catalog.jsonb_build_object(
      'id', v_s.id, 'type', v_s.type, 'min_team_size', v_s.min_team_size, 'max_team_size', v_s.max_team_size,
      'status', v_s.status, 'team_deadline_at', v_s.team_deadline_at),
    'me', private.match_person(v_s.id, v_uid)
          || pg_catalog.jsonb_build_object('timezone', (select p.timezone from public.profiles p where p.id = v_uid)),
    'on_team', exists (select 1 from public.team_members tm where tm.space_id = v_s.id and tm.user_id = v_uid and tm.status = 'active'),
    'total_recruiting', v_total,
    'teams', v_teams);
end
$$;

-- ---------------------------------------------------------------------------
-- get_match_pool — unchanged from 0008 except the candidate filter: students
-- who DECLINED this team's invitation are not suggested to it again, and an
-- expired-but-not-yet-swept pending invitation no longer hides a candidate
-- (send_invitations sweeps it first, so both rules agree).
-- ---------------------------------------------------------------------------
create or replace function public.get_match_pool(p_space_id uuid, p_team_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_scope    text := private.current_scope();
  v_s        public.matching_spaces;
  v_t        public.teams;
  v_team     jsonb := null;
  v_cands    jsonb;
  v_funnel   jsonb;
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;

  select * into v_s from public.matching_spaces s where s.id = p_space_id and s.scope = v_scope;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND: Space not found.';
  end if;
  if not exists (select 1 from public.participations pa where pa.space_id = v_s.id and pa.user_id = v_uid) then
    raise exception using errcode = 'P0001', message = 'NOT_PARTICIPANT: Join this Space to use matching.';
  end if;
  if v_s.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: Team formation is closed for this Space.';
  end if;
  if v_s.team_deadline_at is not null and v_s.team_deadline_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'DEADLINE_PASSED: The team formation deadline has passed.';
  end if;

  if p_team_id is not null then
    select * into v_t from public.teams t where t.id = p_team_id and t.space_id = v_s.id;
    if not found or v_t.status = 'archived' or not exists (
      select 1 from public.team_members tm
      where tm.team_id = v_t.id and tm.user_id = v_uid and tm.status = 'active'
        and (tm.role = 'owner' or tm.can_recruit)
    ) then
      raise exception using errcode = 'P0001', message = 'NOT_RECRUITER: You can only recruit for teams you manage.';
    end if;
    v_team := pg_catalog.jsonb_build_object(
      'id', v_t.id, 'name', v_t.name, 'status', v_t.status, 'recruiting', v_t.recruiting,
      'target_size', v_t.target_size, 'requirements', v_t.requirements,
      'pending_invites', (
        select pg_catalog.count(*) from public.invitations i
        where i.team_id = v_t.id and i.status = 'pending' and i.kind = 'invite' and i.expires_at > pg_catalog.now()),
      'members', (
        select coalesce(pg_catalog.jsonb_agg(private.match_person(v_s.id, tm.user_id) order by tm.joined_at, tm.user_id), '[]'::jsonb)
        from public.team_members tm where tm.team_id = v_t.id and tm.status = 'active'));
  elsif exists (
    select 1 from public.team_members tm
    where tm.space_id = v_s.id and tm.user_id = v_uid and tm.status = 'active'
  ) then
    raise exception using errcode = 'P0001',
      message = 'ALREADY_IN_TEAM: You are already on a team in this Space. Its recruiters can grow it from Grow My Team.';
  end if;

  select coalesce(pg_catalog.jsonb_agg(private.match_person(v_s.id, pa.user_id) order by pa.user_id), '[]'::jsonb)
    into v_cands
  from public.participations pa
  join public.profiles p on p.id = pa.user_id
  where pa.space_id = v_s.id
    and p.scope = v_scope
    and pa.user_id <> v_uid
    and pa.visible_to_members and pa.accept_invites and pa.smart_match_opt_in and pa.looking_for_team
    and not exists (
      select 1 from public.team_members tm
      where tm.space_id = v_s.id and tm.user_id = pa.user_id and tm.status = 'active')
    and (v_t.id is null or not exists (
      select 1 from public.invitations i
      where i.team_id = v_t.id and i.user_id = pa.user_id
        and ((i.status = 'pending' and i.expires_at > pg_catalog.now())
          or (i.kind = 'invite' and i.status = 'declined'))));

  select pg_catalog.jsonb_build_object(
    'others', pg_catalog.count(*),
    'on_a_team', pg_catalog.count(*) filter (where exists (
      select 1 from public.team_members tm
      where tm.space_id = v_s.id and tm.user_id = pa.user_id and tm.status = 'active')),
    'eligible', pg_catalog.jsonb_array_length(v_cands))
    into v_funnel
  from public.participations pa
  where pa.space_id = v_s.id and pa.user_id <> v_uid;

  return pg_catalog.jsonb_build_object(
    'space', pg_catalog.jsonb_build_object(
      'id', v_s.id, 'type', v_s.type, 'min_team_size', v_s.min_team_size, 'max_team_size', v_s.max_team_size),
    'me', private.match_person(v_s.id, v_uid)
          || pg_catalog.jsonb_build_object('timezone', (select p.timezone from public.profiles p where p.id = v_uid)),
    'team', v_team,
    'candidates', v_cands,
    'funnel', v_funnel);
end
$$;

-- ---------------------------------------------------------------------------
-- Demo: reset also clears the sandbox personas' team/invitation limits so
-- rehearsals can't exhaust them before the pitch. Same narrow scoping as 0006:
-- only synthetic personas registered for THIS slot, in this slot's scope.
-- ---------------------------------------------------------------------------
create or replace function public.demo_clear_create_limits(p_slot integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_scope   text := private.demo_scope(p_slot);  -- raises unless 0..20; never 'prod'
  v_deleted integer;
begin
  delete from private.api_events e
   using private.demo_personas dp
   join public.profiles p on p.id = dp.user_id
   where dp.slot = p_slot
     and p.scope = v_scope
     and p.is_synthetic
     and e.subject = dp.user_id::text
     and e.kind in ('create_space', 'create_team', 'send_invitations', 'request_to_join');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

-- ---------------------------------------------------------------------------
-- Grants (default EXECUTE is revoked; internal helpers get none).
-- ---------------------------------------------------------------------------
revoke all on function private.invite_ttl()                                     from public, anon, authenticated;
revoke all on function private.evaluate_team(uuid)                              from public, anon, authenticated;
revoke all on function private.expire_stale_invites(uuid[])                     from public, anon, authenticated;
revoke all on function private.is_recruiter(uuid, uuid)                         from public, anon, authenticated;
revoke all on function public.send_invitations(uuid, uuid[], text)              from public, anon, authenticated;
revoke all on function public.start_team_with_invitations(uuid, jsonb, uuid[], text) from public, anon, authenticated;
revoke all on function public.request_to_join(uuid, text)                       from public, anon, authenticated;
revoke all on function public.respond_invitation(uuid, boolean, boolean)        from public, anon, authenticated;
revoke all on function public.cancel_invitation(uuid)                           from public, anon, authenticated;
revoke all on function public.finalize_team(uuid)                               from public, anon, authenticated;
revoke all on function public.refresh_invitations()                             from public, anon, authenticated;
revoke all on function public.find_teams(uuid, jsonb)                           from public, anon, authenticated;

grant execute on function public.send_invitations(uuid, uuid[], text)              to authenticated;
grant execute on function public.start_team_with_invitations(uuid, jsonb, uuid[], text) to authenticated;
grant execute on function public.request_to_join(uuid, text)                       to authenticated;
grant execute on function public.respond_invitation(uuid, boolean, boolean)        to authenticated;
grant execute on function public.cancel_invitation(uuid)                           to authenticated;
grant execute on function public.finalize_team(uuid)                               to authenticated;
grant execute on function public.refresh_invitations()                             to authenticated;
grant execute on function public.find_teams(uuid, jsonb)                           to authenticated;
-- get_match_pool and demo_clear_create_limits keep their existing grants under CREATE OR REPLACE.
