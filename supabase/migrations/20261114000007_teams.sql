-- TrojanMatch 0007 — Team Foundation (P4-A).
--
-- Adds (no existing data is modified):
--   * private.valid_team_requirements(jsonb) + CHECK constraint on teams.requirements
--   * trigger: team target size must stay within the Space's min/max and never
--     below the current number of accepted members
--   * trigger: accepted members can never exceed a team's target size (capacity)
--   * RPCs create_team / update_team (authenticated, SECURITY DEFINER)
--   * demo_reset_slot now also loads synthetic teams (CREATE OR REPLACE; the
--     body is the reviewed 0005 version plus step 5 "teams")
-- Not here (P5): invitations, acceptance, activation, leaving/removing members.

-- ---------------------------------------------------------------------------
-- Structured recruitment requirements, validated in PostgreSQL.
-- Shape: { must_roles[], preferred_roles[], skills[], topics[], goal,
--          min_shared_hours, note } — every key optional, no other keys.
-- Role ids mirror lib/taxonomy.ts ROLES (a test asserts they stay in sync).
-- ---------------------------------------------------------------------------
create function private.valid_team_requirements(r jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    pg_catalog.jsonb_typeof(r) = 'object'
    -- only known keys
    and not exists (
      select 1 from pg_catalog.jsonb_object_keys(r) k
      where k not in ('must_roles', 'preferred_roles', 'skills', 'topics', 'goal', 'min_shared_hours', 'note')
    )
    -- role lists: arrays of known role ids, at most 6 each
    and coalesce((
      select bool_and(
        pg_catalog.jsonb_typeof(r -> key) = 'array'
        and pg_catalog.jsonb_array_length(r -> key) <= 6
        and not exists (
          select 1 from pg_catalog.jsonb_array_elements(r -> key) e
          where pg_catalog.jsonb_typeof(e) <> 'string'
             or (e #>> '{}') not in ('frontend', 'backend', 'ai_ml', 'data', 'design', 'pm_pitch', 'research', 'writing', 'flexible')
        ))
      from (values ('must_roles'), ('preferred_roles')) v(key)
      where r ? key
    ), true)
    -- tag lists: skills (≤20) and topics (≤10), lowercase tags ≤30 chars
    and coalesce((
      select bool_and(
        pg_catalog.jsonb_typeof(r -> key) = 'array'
        and pg_catalog.jsonb_array_length(r -> key) <= lim
        and not exists (
          select 1 from pg_catalog.jsonb_array_elements(r -> key) e
          where pg_catalog.jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z0-9][a-z0-9+#./ -]{0,29}$'
        ))
      from (values ('skills', 20), ('topics', 10)) v(key, lim)
      where r ? key
    ), true)
    and (not r ? 'goal' or pg_catalog.jsonb_typeof(r -> 'goal') = 'null' or (
      pg_catalog.jsonb_typeof(r -> 'goal') = 'string'
      and (r ->> 'goal') in ('competitive', 'build', 'learn', 'aim_a', 'learn_deeply', 'meet_requirements')
    ))
    and (not r ? 'min_shared_hours' or pg_catalog.jsonb_typeof(r -> 'min_shared_hours') = 'null' or (
      pg_catalog.jsonb_typeof(r -> 'min_shared_hours') = 'number'
      and (r ->> 'min_shared_hours') ~ '^[0-9]+$'
      and (r ->> 'min_shared_hours')::integer between 0 and 40
    ))
    and (not r ? 'note' or pg_catalog.jsonb_typeof(r -> 'note') = 'null' or (
      pg_catalog.jsonb_typeof(r -> 'note') = 'string' and pg_catalog.char_length(r ->> 'note') <= 500
    ))
$$;

alter table public.teams
  add constraint teams_requirements_valid check (private.valid_team_requirements(requirements));

-- ---------------------------------------------------------------------------
-- Target size: within the Space's bounds and never below accepted members.
-- ---------------------------------------------------------------------------
create function private.enforce_team_size()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_min smallint;
  v_max smallint;
  v_members integer;
begin
  select s.min_team_size, s.max_team_size into v_min, v_max
  from public.matching_spaces s where s.id = new.space_id;
  if new.target_size < greatest(v_min, 2) or new.target_size > v_max then
    raise exception using errcode = 'P0001',
      message = pg_catalog.format('INVALID_INPUT: Team size must be between %s and %s for this Space.', greatest(v_min, 2), v_max);
  end if;
  if tg_op = 'UPDATE' then
    select pg_catalog.count(*) into v_members
    from public.team_members tm where tm.team_id = new.id and tm.status = 'active';
    if new.target_size < v_members then
      raise exception using errcode = 'P0001',
        message = pg_catalog.format('TEAM_FULL: The team already has %s members.', v_members);
    end if;
  end if;
  return new;
end
$$;

create trigger teams_enforce_size
  before insert or update of target_size, space_id on public.teams
  for each row execute function private.enforce_team_size();

-- ---------------------------------------------------------------------------
-- Capacity: accepted members never exceed the team's target size. Locks the team
-- row so concurrent joins serialize (P5 acceptance relies on this too).
-- ---------------------------------------------------------------------------
create function private.enforce_team_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_team public.teams;
  v_members integer;
begin
  select * into v_team from public.teams t where t.id = new.team_id for update;
  if v_team.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'TEAM_FULL: This team is archived.';
  end if;
  select pg_catalog.count(*) into v_members
  from public.team_members tm
  where tm.team_id = new.team_id and tm.status = 'active' and tm.user_id <> new.user_id;
  if v_members + 1 > v_team.target_size then
    raise exception using errcode = 'P0001', message = 'TEAM_FULL: This team has no open positions.';
  end if;
  return new;
end
$$;

create trigger team_members_enforce_capacity
  before insert or update of status on public.team_members
  for each row when (new.status = 'active')
  execute function private.enforce_team_capacity();

-- ---------------------------------------------------------------------------
-- Shared validation for create/update payloads.
-- ---------------------------------------------------------------------------
create function private.check_team_goal(p_space_type public.space_type, p_requirements jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_requirements ? 'goal' and pg_catalog.jsonb_typeof(p_requirements -> 'goal') = 'string' and not (
    (p_space_type = 'hackathon' and (p_requirements ->> 'goal') in ('competitive', 'build', 'learn'))
    or (p_space_type = 'course' and (p_requirements ->> 'goal') in ('aim_a', 'learn_deeply', 'meet_requirements'))
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: That goal does not apply to this kind of Space.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- create_team — a participant creates a team in a Space they joined.
-- The creator becomes owner + accepted member (can recruit). Status starts as
-- 'draft'; forming/active transitions belong to invitations (P5).
-- ---------------------------------------------------------------------------
create function public.create_team(p_space_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_scope   text := private.current_scope();
  p         jsonb := coalesce(p_payload, '{}'::jsonb);
  v_s       public.matching_spaces;
  v_name    text := pg_catalog.btrim(p ->> 'name');
  v_desc    text := nullif(pg_catalog.btrim(p ->> 'description'), '');
  v_open    integer;
  v_req     jsonb := coalesce(p -> 'requirements', '{}'::jsonb);
  v_team_id uuid := gen_random_uuid();
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;

  select * into v_s from public.matching_spaces s where s.id = p_space_id and s.scope = v_scope;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND: Space not found.';
  end if;
  if not exists (select 1 from public.participations pa where pa.space_id = v_s.id and pa.user_id = v_uid) then
    raise exception using errcode = 'P0001', message = 'NOT_PARTICIPANT: Join this Space before creating a team.';
  end if;
  if v_s.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: This Space is not accepting new teams.';
  end if;
  if v_s.team_deadline_at is not null and v_s.team_deadline_at <= pg_catalog.now() then
    raise exception using errcode = 'P0001', message = 'DEADLINE_PASSED: The team formation deadline has passed.';
  end if;
  if exists (
    select 1 from public.team_members tm where tm.space_id = v_s.id and tm.user_id = v_uid and tm.status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'ALREADY_IN_TEAM: You are already on a team in this Space.';
  end if;

  perform private.rate_limit_hit(v_uid::text, 'create_team', 10, interval '1 hour');

  if v_name is null or pg_catalog.char_length(v_name) not between 2 and 60 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Team name must be 2–60 characters.';
  end if;
  if v_desc is not null and pg_catalog.char_length(v_desc) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Description must be at most 500 characters.';
  end if;
  if pg_catalog.jsonb_typeof(p -> 'open_positions') <> 'number' or (p ->> 'open_positions') !~ '^[0-9]+$' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Open positions must be a whole number.';
  end if;
  v_open := (p ->> 'open_positions')::integer;
  if v_open < 1 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: A new team needs at least one open position.';
  end if;
  if not private.valid_team_requirements(v_req) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Team requirements are not valid.';
  end if;
  perform private.check_team_goal(v_s.type, v_req);

  -- target = owner + open positions; the size trigger enforces the Space bounds.
  insert into public.teams (id, space_id, owner_id, name, description, status, recruiting, target_size, requirements)
  values (
    v_team_id, v_s.id, v_uid, v_name, v_desc, 'draft',
    coalesce((p ->> 'recruiting')::boolean, true), (1 + v_open)::smallint, v_req);

  insert into public.team_members (team_id, space_id, user_id, role, can_recruit)
  values (v_team_id, v_s.id, v_uid, 'owner', true);

  return pg_catalog.jsonb_build_object('team_id', v_team_id, 'space_id', v_s.id, 'target_size', 1 + v_open);
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'ALREADY_IN_TEAM: You are already on a team in this Space.';
end
$$;

-- ---------------------------------------------------------------------------
-- update_team — only active members who are the owner or have can_recruit.
-- Every field is optional; omitted fields are unchanged.
-- ---------------------------------------------------------------------------
create function public.update_team(p_team_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_scope   text := private.current_scope();
  p         jsonb := coalesce(p_payload, '{}'::jsonb);
  v_t       public.teams;
  v_s       public.matching_spaces;
  v_members integer;
  v_name    text;
  v_desc    text;
  v_req     jsonb;
  v_target  integer;
  v_recruit boolean;
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
    where tm.team_id = v_t.id and tm.user_id = v_uid and tm.status = 'active'
      and (tm.role = 'owner' or tm.can_recruit)
  ) then
    -- Same answer whether the team is missing or simply not yours.
    raise exception using errcode = 'P0001', message = 'NOT_RECRUITER: You can only edit teams you recruit for.';
  end if;
  if v_t.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: This team is archived.';
  end if;
  select * into v_s from public.matching_spaces s where s.id = v_t.space_id;
  if v_s.status = 'archived' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: This Space is archived.';
  end if;

  select pg_catalog.count(*) into v_members
  from public.team_members tm where tm.team_id = v_t.id and tm.status = 'active';

  v_name := coalesce(pg_catalog.btrim(p ->> 'name'), v_t.name);
  if pg_catalog.char_length(v_name) not between 2 and 60 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Team name must be 2–60 characters.';
  end if;
  v_desc := case when p ? 'description' then nullif(pg_catalog.btrim(p ->> 'description'), '') else v_t.description end;
  if v_desc is not null and pg_catalog.char_length(v_desc) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Description must be at most 500 characters.';
  end if;

  v_req := case when p ? 'requirements' then coalesce(p -> 'requirements', '{}'::jsonb) else v_t.requirements end;
  if not private.valid_team_requirements(v_req) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Team requirements are not valid.';
  end if;
  perform private.check_team_goal(v_s.type, v_req);

  v_target := v_t.target_size;
  if p ? 'open_positions' then
    if pg_catalog.jsonb_typeof(p -> 'open_positions') <> 'number' or (p ->> 'open_positions') !~ '^[0-9]+$' then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Open positions must be a whole number.';
    end if;
    v_target := v_members + (p ->> 'open_positions')::integer;
  end if;

  v_recruit := coalesce((p ->> 'recruiting')::boolean, v_t.recruiting);
  if v_recruit and not v_t.recruiting and (
    v_s.status <> 'open'
    or (v_s.team_deadline_at is not null and v_s.team_deadline_at <= pg_catalog.now())
  ) then
    raise exception using errcode = 'P0001', message = 'DEADLINE_PASSED: Recruiting is closed for this Space.';
  end if;
  if v_recruit and v_target <= v_members then
    raise exception using errcode = 'P0001', message = 'TEAM_FULL: Add at least one open position to recruit.';
  end if;

  update public.teams t
     set name = v_name, description = v_desc, requirements = v_req,
         target_size = v_target::smallint, recruiting = v_recruit
   where t.id = v_t.id;

  return pg_catalog.jsonb_build_object(
    'team_id', v_t.id, 'target_size', v_target, 'members', v_members, 'open_positions', v_target - v_members,
    'recruiting', v_recruit);
exception
  when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Some fields have an invalid format.';
end
$$;

-- ---------------------------------------------------------------------------
-- Demo reset now also loads synthetic teams (step 5). Steps 1–4 are unchanged
-- from 0005. Still service_role only; still scoped to one demo slot.
-- ---------------------------------------------------------------------------
create or replace function public.demo_reset_slot(p_slot integer, p_fixture jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_scope     text := private.demo_scope(p_slot);
  v_uid       uuid;
  v_space_id  uuid;
  v_spaces    jsonb := '{}'::jsonb;
  v_title     text;
  v_identity  text;
  v_slug      text;
  v_tz        text;
  v_code      text;
  v_n_people  integer := 0;
  v_n_part    integer := 0;
  r           record;
  h           jsonb;
  c           jsonb;
  v_team_id   uuid;
  v_n_teams   integer := 0;
  v_member    text;
begin
  if p_fixture is null or pg_catalog.jsonb_typeof(p_fixture -> 'personas') <> 'array' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: fixture must contain personas.';
  end if;

  -- 1. Remove every Space in THIS demo scope (cascades participations, teams,
  --    members, invitations, match runs, messages, briefs, join codes).
  delete from public.matching_spaces s where s.scope = v_scope;

  -- 2. Restore persona profiles + simulation defaults.
  for r in
    select * from pg_catalog.jsonb_to_recordset(p_fixture -> 'personas') as x(
      key text, display_name text, university text, bio text, skills text[], roles text[],
      interests text[], experience text, working_style jsonb, availability smallint[], timezone text,
      hackathon_goal text, course_goal text, sim_rank integer)
  loop
    select dp.user_id into v_uid from private.demo_personas dp where dp.slot = p_slot and dp.persona_key = r.key;
    if v_uid is null then
      raise exception using errcode = 'P0001', message = 'DEMO_PERSONA_MISSING: ' || r.key || ' (run the seed script)';
    end if;
    update public.profiles p
       set display_name = r.display_name, university = r.university, bio = r.bio,
           skills = r.skills, roles = r.roles, interests = r.interests,
           experience = r.experience::public.experience_level, working_style = coalesce(r.working_style, '{}'::jsonb),
           availability = r.availability, timezone = r.timezone, onboarded = true
     where p.id = v_uid and p.scope = v_scope and p.is_synthetic;
    if not found then
      raise exception using errcode = 'P0001', message = 'DEMO_SCOPE_VIOLATION: persona ' || r.key;
    end if;
    update private.demo_personas dp
       set hackathon_goal = r.hackathon_goal, course_goal = r.course_goal, sim_rank = coalesce(r.sim_rank, 1000)
     where dp.slot = p_slot and dp.persona_key = r.key;
    v_n_people := v_n_people + 1;
  end loop;

  -- 3. Recreate fixture Spaces in this scope.
  for r in
    select * from pg_catalog.jsonb_to_recordset(coalesce(p_fixture -> 'spaces', '[]'::jsonb)) as x(
      key text, type text, title text, visibility text, creator text,
      min_team_size smallint, max_team_size smallint, team_size_source text, hackathon jsonb, course jsonb)
  loop
    select dp.user_id into v_uid from private.demo_personas dp where dp.slot = p_slot and dp.persona_key = r.creator;
    v_space_id := gen_random_uuid();
    h := r.hackathon;
    c := r.course;
    if r.type = 'hackathon' then
      v_title := r.title;
      v_identity := private.hackathon_identity_key(r.title, (h ->> 'edition_year')::integer);
    else
      v_title := pg_catalog.left((c ->> 'course_code') || ' · ' || (c ->> 'assignment_name') || ' · ' || (c ->> 'term'), 140);
      v_identity := private.course_identity_key(
        c ->> 'university', c ->> 'term', c ->> 'course_code',
        coalesce(nullif(c ->> 'assignment_key', ''), c ->> 'assignment_name'),
        array(select pg_catalog.jsonb_array_elements_text(c -> 'allowed_sections')));
    end if;
    v_slug := pg_catalog.btrim(private.slugify(v_title) || '-' || private.random_string(8, 'abcdefghijkmnpqrstuvwxyz23456789'), '-');

    insert into public.matching_spaces (
      id, scope, type, title, title_normalized, slug, identity_key, created_by,
      visibility, join_policy, min_team_size, max_team_size, team_size_source)
    values (
      v_space_id, v_scope, r.type::public.space_type, v_title, private.normalize_title(v_title), v_slug,
      v_identity, v_uid, r.visibility::public.space_visibility,
      case when r.visibility = 'unlisted' then 'code' else 'open' end::public.join_policy,
      r.min_team_size, r.max_team_size, r.team_size_source::public.team_size_source);

    if r.type = 'hackathon' then
      v_tz := h ->> 'timezone';
      insert into public.space_hackathon_details (
        space_id, scope, edition_year, organizer, official_url, official_url_normalized,
        starts_at, ends_at, timezone, format, location, rules_url)
      values (
        v_space_id, v_scope, (h ->> 'edition_year')::smallint, h ->> 'organizer', h ->> 'official_url',
        private.normalize_url(h ->> 'official_url'),
        (h ->> 'start_date')::date::timestamp at time zone v_tz,
        (((h ->> 'end_date')::date + 1)::timestamp at time zone v_tz) - interval '1 second',
        v_tz, (h ->> 'format')::public.hackathon_format, h ->> 'location', h ->> 'rules_url');
    else
      insert into public.space_course_details (
        space_id, scope, university, term, course_code, course_title, allowed_sections,
        assignment_name, assignment_key, instructions_url)
      values (
        v_space_id, v_scope, c ->> 'university', c ->> 'term', c ->> 'course_code', c ->> 'course_title',
        array(select pg_catalog.jsonb_array_elements_text(c -> 'allowed_sections')),
        c ->> 'assignment_name', c ->> 'assignment_key', c ->> 'instructions_url');
    end if;

    if r.visibility = 'unlisted' then
      v_code := private.random_string(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
      insert into public.space_secrets (space_id, join_code) values (v_space_id, v_code);
    end if;

    v_spaces := v_spaces || pg_catalog.jsonb_build_object(r.key, pg_catalog.jsonb_build_object('id', v_space_id, 'slug', v_slug));
  end loop;

  -- 4. Seeded participations (labeled source = 'seed').
  for r in
    select * from pg_catalog.jsonb_to_recordset(coalesce(p_fixture -> 'participations', '[]'::jsonb)) as x(
      space text, persona text, goal text, desired_roles text[], topics text[],
      looking_for_team boolean, accept_invites boolean, smart_match_opt_in boolean,
      visible_to_members boolean, notes text)
  loop
    select dp.user_id into v_uid from private.demo_personas dp where dp.slot = p_slot and dp.persona_key = r.persona;
    if v_uid is null or (v_spaces -> r.space) is null then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: unknown persona/space in fixture: ' || r.persona || '/' || r.space;
    end if;
    insert into public.participations (
      space_id, user_id, goal, desired_roles, topics, looking_for_team, accept_invites,
      smart_match_opt_in, visible_to_members, notes, setup_completed, source)
    values (
      (v_spaces -> r.space ->> 'id')::uuid, v_uid, r.goal, coalesce(r.desired_roles, '{}'), coalesce(r.topics, '{}'),
      coalesce(r.looking_for_team, false), coalesce(r.accept_invites, false),
      coalesce(r.smart_match_opt_in, false), coalesce(r.visible_to_members, false), r.notes, true, 'seed');
    v_n_part := v_n_part + 1;
  end loop;

  -- 5. Seeded synthetic teams (P4-A). Every row passes the same constraints and
  --    triggers as real teams: requirements CHECK, target size within the Space's
  --    min/max, capacity, one active team per user per Space, members must be
  --    participants of the same Space.
  for r in
    select * from pg_catalog.jsonb_to_recordset(coalesce(p_fixture -> 'teams', '[]'::jsonb)) as x(
      space text, name text, description text, owner text, members text[], status text,
      recruiting boolean, target_size smallint, requirements jsonb)
  loop
    select dp.user_id into v_uid from private.demo_personas dp where dp.slot = p_slot and dp.persona_key = r.owner;
    if v_uid is null or (v_spaces -> r.space) is null then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: unknown team owner/space in fixture: ' || r.owner || '/' || r.space;
    end if;
    if r.status not in ('draft', 'active') then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: seeded teams must be draft or active';
    end if;
    v_team_id := gen_random_uuid();
    insert into public.teams (
      id, space_id, owner_id, name, description, status, recruiting, target_size, requirements,
      activation_mode, activated_at)
    values (
      v_team_id, (v_spaces -> r.space ->> 'id')::uuid, v_uid, r.name, r.description,
      r.status::public.team_status, coalesce(r.recruiting, true), r.target_size, coalesce(r.requirements, '{}'::jsonb),
      case when r.status = 'active' then 'auto'::public.activation_mode end,
      case when r.status = 'active' then pg_catalog.now() end);
    insert into public.team_members (team_id, space_id, user_id, role, can_recruit)
    values (v_team_id, (v_spaces -> r.space ->> 'id')::uuid, v_uid, 'owner', true);
    foreach v_member in array coalesce(r.members, '{}') loop
      select dp.user_id into v_uid from private.demo_personas dp where dp.slot = p_slot and dp.persona_key = v_member;
      if v_uid is null then
        raise exception using errcode = 'P0001', message = 'INVALID_INPUT: unknown team member in fixture: ' || v_member;
      end if;
      insert into public.team_members (team_id, space_id, user_id, role, can_recruit)
      values (v_team_id, (v_spaces -> r.space ->> 'id')::uuid, v_uid, 'member', false);
    end loop;
    -- An active team must meet the Space minimum (same rule P5 activation uses).
    if r.status = 'active' and (
      select pg_catalog.count(*) from public.team_members tm where tm.team_id = v_team_id and tm.status = 'active'
    ) < (
      select greatest(s.min_team_size, 2) from public.matching_spaces s where s.id = (v_spaces -> r.space ->> 'id')::uuid
    ) then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: seeded active team below the Space minimum: ' || r.name;
    end if;
    v_n_teams := v_n_teams + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'scope', v_scope, 'personas', v_n_people, 'participations', v_n_part, 'teams', v_n_teams, 'spaces', v_spaces);
end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function private.valid_team_requirements(jsonb)                       from public, anon, authenticated;
revoke all on function private.enforce_team_size()                                   from public, anon, authenticated;
revoke all on function private.enforce_team_capacity()                               from public, anon, authenticated;
revoke all on function private.check_team_goal(public.space_type, jsonb)             from public, anon, authenticated;
revoke all on function public.create_team(uuid, jsonb)                               from public, anon, authenticated;
revoke all on function public.update_team(uuid, jsonb)                               from public, anon, authenticated;

grant execute on function public.create_team(uuid, jsonb) to authenticated;
grant execute on function public.update_team(uuid, jsonb) to authenticated;
-- demo_reset_slot keeps its existing grant (service_role only) under CREATE OR REPLACE.
