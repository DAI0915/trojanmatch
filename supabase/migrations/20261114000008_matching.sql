-- TrojanMatch 0008 — Matching pool (P4-B). READ-ONLY: adds two STABLE functions,
-- changes no table, policy, existing function or data.
--
-- get_match_pool() is hard-constraint gate #1 for Smart Team Formation, Replace
-- and Grow My Team. Everything that must never be a "score penalty" is enforced
-- here, in PostgreSQL:
--   * caller is signed in, in the Space's scope (prod vs demo:<n>) and a participant
--   * Space is open and before its team deadline
--   * with p_team_id: caller is the owner / a delegated recruiter of THAT team in
--     THIS Space; without it: caller must not already be on a team here
--   * candidates: same Space AND same scope, not the caller, and ALL of
--     visible_to_members, accept_invites, smart_match_opt_in, looking_for_team,
--     and not an accepted member of any team in this Space, and not already
--     holding a pending invitation from this team
-- Data minimization: only matching features are returned (no email, bio,
-- university, notes or other Spaces' data).

create function private.match_person(p_space_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', p.id,
    'name', p.display_name,
    'synthetic', p.is_synthetic,
    'skills', p.skills,
    'profile_roles', p.roles,
    'desired_roles', pa.desired_roles,
    'interests', p.interests,
    'topics', pa.topics,
    'experience', p.experience,
    'working_style', p.working_style,
    'availability', coalesce(pa.availability_override, p.availability),
    'goal', pa.goal)
  from public.profiles p
  join public.participations pa on pa.user_id = p.id and pa.space_id = p_space_id
  where p.id = p_user_id
$$;

create function public.get_match_pool(p_space_id uuid, p_team_id uuid default null)
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
      -- Same answer whether the team is missing, in another Space, or not yours.
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
      where i.team_id = v_t.id and i.user_id = pa.user_id and i.status = 'pending'));

  -- Aggregate counts only (no identities) so the UI can explain an empty pool.
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

revoke all on function private.match_person(uuid, uuid)   from public, anon, authenticated;
revoke all on function public.get_match_pool(uuid, uuid)   from public, anon, authenticated;
grant execute on function public.get_match_pool(uuid, uuid) to authenticated;
