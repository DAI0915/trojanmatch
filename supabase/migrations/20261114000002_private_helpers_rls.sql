-- TrojanMatch 0002 — private helpers, RLS policies, explicit grants.
-- Rules (docs/IMPLEMENTATION_PLAN.md §G2):
--   * every function: SET search_path = '' and fully schema-qualified names
--   * EXECUTE revoked from PUBLIC/anon/authenticated by default; granted explicitly
--   * the private schema is NOT in PostgREST's exposed schemas
--   * no direct INSERT/UPDATE/DELETE on spaces/teams/members/invitations (RPC only)

-- ---------------------------------------------------------------------------
-- Default privileges: nothing new is executable unless granted explicitly.
-- ---------------------------------------------------------------------------
alter default privileges in schema public  revoke execute on functions from public;
alter default privileges in schema public  revoke execute on functions from anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from anon, authenticated;
alter default privileges in schema private revoke all on tables from anon, authenticated;
-- Supabase grants anon/authenticated ALL on every FUTURE public table by default.
-- Revoke that so a table added in a later phase is closed until granted explicitly.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- Functions created in 0001
revoke all on function private.valid_hours(smallint[]) from public, anon, authenticated;
revoke all on function private.set_updated_at()        from public, anon, authenticated;
revoke all on function private.handle_new_user()       from public, anon, authenticated;
revoke all on function private.sync_profile_scope()    from public, anon, authenticated;
-- valid_hours is used by CHECK constraints; constraint evaluation needs EXECUTE for
-- the role performing the write (participation/profile updates by authenticated).
grant execute on function private.valid_hours(smallint[]) to authenticated, service_role;

-- Private schema: usage only so RLS policies can call helper functions.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
revoke all on all tables in schema private from public, anon, authenticated;
grant all on all tables in schema private to service_role;

-- ---------------------------------------------------------------------------
-- RLS helper functions (STABLE, SECURITY DEFINER, read-only booleans)
-- ---------------------------------------------------------------------------
create function private.current_scope()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.scope::text from public.profiles p where p.id = auth.uid()
$$;

create function private.is_participant(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participations pa
    where pa.space_id = p_space_id and pa.user_id = auth.uid()
  )
$$;

create function private.is_active_member(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'active'
  )
$$;

create function private.can_recruit(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'active'
      and (tm.role = 'owner' or tm.can_recruit)
  )
$$;

create function private.team_is_active(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams t where t.id = p_team_id and t.status = 'active')
$$;

-- A team is visible to: its active members; participants of its Space while it is
-- recruiting (and not archived); and students with an invitation/request for it.
create function private.team_visible(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_active_member(p_team_id)
    or exists (
      select 1 from public.teams t
      where t.id = p_team_id and t.recruiting and t.status <> 'archived'
        and private.is_participant(t.space_id)
    )
    or exists (
      select 1 from public.invitations i
      where i.team_id = p_team_id and i.user_id = auth.uid()
    )
$$;

-- Another user's GLOBAL profile is visible only if they consented in a Space we
-- share, we are teammates, or we are counterparts on an invitation/request.
create function private.profile_visible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = auth.uid()
    or exists (
      select 1
      from public.participations mine
      join public.participations theirs on theirs.space_id = mine.space_id
      where mine.user_id = auth.uid()
        and theirs.user_id = p_user_id
        and theirs.visible_to_members
    )
    or exists (
      select 1
      from public.team_members a
      join public.team_members b on b.team_id = a.team_id
      where a.user_id = auth.uid() and a.status = 'active'
        and b.user_id = p_user_id and b.status = 'active'
    )
    or exists (  -- they invited/requested me, or are a member of a team that did
      select 1 from public.invitations i
      where i.user_id = auth.uid()
        and (i.actor_id = p_user_id or exists (
          select 1 from public.team_members tm
          where tm.team_id = i.team_id and tm.user_id = p_user_id and tm.status = 'active'
        ))
    )
    or exists (  -- I am an active member of a team that has an invitation/request with them
      select 1 from public.invitations i
      where i.user_id = p_user_id and private.is_active_member(i.team_id)
    )
$$;

-- Space-specific participation of another user.
create function private.participation_visible(p_space_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id = auth.uid()
    or (
      private.is_participant(p_space_id)
      and (
        exists (
          select 1 from public.participations pa
          where pa.space_id = p_space_id and pa.user_id = p_user_id and pa.visible_to_members
        )
        or exists (
          select 1 from public.team_members a
          join public.team_members b on b.team_id = a.team_id
          where a.space_id = p_space_id
            and a.user_id = auth.uid() and a.status = 'active'
            and b.user_id = p_user_id and b.status = 'active'
        )
        or exists (
          select 1 from public.invitations i
          where i.space_id = p_space_id
            and ((i.user_id = p_user_id and private.is_active_member(i.team_id))
              or (i.user_id = auth.uid() and i.actor_id = p_user_id))
        )
      )
    )
$$;

-- Helper grants: callable by authenticated (RLS evaluation) but private is not
-- exposed over HTTP, so they cannot be invoked as RPCs.
do $$
declare f text;
begin
  foreach f in array array[
    'private.current_scope()',
    'private.is_participant(uuid)',
    'private.is_active_member(uuid)',
    'private.can_recruit(uuid)',
    'private.team_is_active(uuid)',
    'private.team_visible(uuid)',
    'private.profile_visible(uuid)',
    'private.participation_visible(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Table privileges: start from zero, grant the minimum.
-- (Supabase grants ALL on public tables to anon/authenticated by default.)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- profiles: read (RLS-filtered), update own editable columns only.
grant select on public.profiles to authenticated;
grant update (display_name, university, bio, skills, roles, interests, experience,
              working_style, availability, timezone, onboarded)
  on public.profiles to authenticated;

-- spaces + details: read only. Course instructions_url is NOT granted (participant
-- RPC in P2). Writes are RPC-only.
grant select on public.matching_spaces to anon, authenticated;
grant select on public.space_hackathon_details to anon, authenticated;
grant select (space_id, scope, university, term, course_code, course_title,
              allowed_sections, assignment_name, assignment_key)
  on public.space_course_details to anon, authenticated;

-- participations: read (RLS), update own preference columns only.
grant select on public.participations to authenticated;
grant update (goal, goal_note, desired_roles, topics, availability_override,
              looking_for_team, accept_invites, smart_match_opt_in,
              visible_to_members, setup_completed, notes)
  on public.participations to authenticated;

-- teams / members / invitations / match runs: read only (RPC-only writes).
grant select on public.teams        to authenticated;
grant select on public.team_members to authenticated;
grant select on public.invitations  to authenticated;
grant select on public.match_runs   to authenticated;

-- messages: read + insert (no update/delete).
grant select on public.messages to authenticated;
grant insert (team_id, body, client_id) on public.messages to authenticated;

-- kickoff briefs: read + insert by active members of active teams.
grant select on public.kickoff_briefs to authenticated;
grant insert (team_id, brief, source) on public.kickoff_briefs to authenticated;

-- space_secrets: nothing for anon/authenticated (already revoked above).

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles                enable row level security;
alter table public.matching_spaces         enable row level security;
alter table public.space_hackathon_details enable row level security;
alter table public.space_course_details    enable row level security;
alter table public.space_secrets           enable row level security;
alter table public.participations          enable row level security;
alter table public.teams                   enable row level security;
alter table public.team_members            enable row level security;
alter table public.match_runs              enable row level security;
alter table public.invitations             enable row level security;
alter table public.messages                enable row level security;
alter table public.kickoff_briefs          enable row level security;
alter table private.app_config             enable row level security;
alter table private.api_events             enable row level security;
alter table private.demo_slots             enable row level security;

-- profiles
create policy profiles_select on public.profiles
  for select to authenticated
  using (private.profile_visible(id));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- matching_spaces: anon sees prod public metadata; authenticated sees its own scope's
-- public Spaces plus Spaces it participates in. created_by grants nothing.
create policy matching_spaces_select_anon on public.matching_spaces
  for select to anon
  using (scope = 'prod' and visibility = 'public');
create policy matching_spaces_select_auth on public.matching_spaces
  for select to authenticated
  using (
    scope = (select private.current_scope())
    and (visibility = 'public' or private.is_participant(id))
  );

-- details follow the parent Space's visibility (RLS applies inside the subquery).
create policy space_hackathon_details_select on public.space_hackathon_details
  for select to anon, authenticated
  using (exists (select 1 from public.matching_spaces s where s.id = space_id));
create policy space_course_details_select on public.space_course_details
  for select to anon, authenticated
  using (exists (select 1 from public.matching_spaces s where s.id = space_id));

-- space_secrets: RLS on, NO policies.

-- participations
create policy participations_select on public.participations
  for select to authenticated
  using (private.participation_visible(space_id, user_id));
create policy participations_update_own on public.participations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- teams / members
create policy teams_select on public.teams
  for select to authenticated
  using (private.team_visible(id));
create policy team_members_select on public.team_members
  for select to authenticated
  using (private.team_visible(team_id));

-- invitations: the student, or active members of the team.
create policy invitations_select on public.invitations
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_active_member(team_id));

-- match runs: initiator only.
create policy match_runs_select_own on public.match_runs
  for select to authenticated
  using (initiator_id = (select auth.uid()));

-- messages: confirmed (active) members of an ACTIVE team only. Space creators,
-- pending invitees and other teams get nothing.
create policy messages_select_members on public.messages
  for select to authenticated
  using (private.is_active_member(team_id) and private.team_is_active(team_id));
create policy messages_insert_members on public.messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and private.is_active_member(team_id)
    and private.team_is_active(team_id)
  );

-- kickoff briefs
create policy kickoff_briefs_select_members on public.kickoff_briefs
  for select to authenticated
  using (private.is_active_member(team_id));
create policy kickoff_briefs_insert_members on public.kickoff_briefs
  for insert to authenticated
  with check (
    generated_by = (select auth.uid())
    and private.is_active_member(team_id)
    and private.team_is_active(team_id)
  );
