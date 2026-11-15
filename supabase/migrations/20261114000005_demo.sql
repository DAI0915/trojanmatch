-- TrojanMatch 0005 — Presenter demo sandbox (P3).
--
-- Safety model:
--   * Every demo operation derives its scope from a slot NUMBER via
--     private.demo_scope(), which can only ever return 'demo:<0-20>'. There is no
--     code path that produces 'prod', so demo administration cannot touch
--     production rows. Every write is additionally filtered by that scope.
--   * Admin functions live in public (PostgREST cannot reach `private`) but
--     EXECUTE is granted to service_role ONLY. anon/authenticated cannot call them
--     (enforced by tests/integration/catalog-security.test.ts).
--   * No writes to auth.* tables. Sessions are managed by the app via supported
--     Supabase Auth APIs; leases are validated here.
--
-- NOTE ON NUMBERING: 0004 is reserved by the plan for team RPCs (P4). P4's
-- migration will use a LATER timestamp so migrations stay strictly ordered.

-- ---------------------------------------------------------------------------
-- Labeling: where a participation came from.
-- 'self' = the student joined; 'seed' = demo fixture; 'simulated' = demo
-- "simulate participants joining". Not user-updatable (no column grant).
-- ---------------------------------------------------------------------------
alter table public.participations
  add column source text not null default 'self'
  check (source in ('self', 'seed', 'simulated'));

-- Registry of synthetic personas per demo slot (populated by scripts/seed-demo.ts).
create table private.demo_personas (
  slot            smallint not null check (slot between 0 and 20),
  persona_key     text not null check (persona_key ~ '^[a-z][a-z0-9_]{1,31}$'),
  user_id         uuid not null unique references public.profiles (id) on delete cascade,
  hackathon_goal  text check (hackathon_goal in ('competitive', 'build', 'learn')),
  course_goal     text check (course_goal in ('aim_a', 'learn_deeply', 'meet_requirements')),
  sim_rank        integer not null default 1000,
  switchable      boolean not null default false,
  primary key (slot, persona_key)
);
alter table private.demo_personas enable row level security;  -- no policies
revoke all on private.demo_personas from public, anon, authenticated;
grant all on private.demo_personas to service_role;

-- ---------------------------------------------------------------------------
-- Guards / shared domain logic
-- ---------------------------------------------------------------------------

-- The ONLY way demo code obtains a scope. Never returns 'prod'.
create function private.demo_scope(p_slot integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_slot is null or p_slot < 0 or p_slot > 20 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Invalid demo slot.';
  end if;
  return 'demo:' || p_slot::text;
end
$$;

-- Join rules shared by real joins and simulated joins (scope, status, policy,
-- code, idempotency, failed-code rate limit). p_user is supplied by trusted
-- callers only (public.join_space passes auth.uid(); demo_simulate_joins passes
-- registered synthetic personas). Not executable by any client role.
create function private.join_space_as(p_user uuid, p_space_id uuid, p_code text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_scope  text;
  v_s      public.matching_spaces;
  v_secret text;
  v_given  text;
begin
  select p.scope::text into v_scope from public.profiles p where p.id = p_user;
  if v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;

  select * into v_s from public.matching_spaces s where s.id = p_space_id and s.scope = v_scope;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND: Space not found.';
  end if;

  if exists (select 1 from public.participations pa where pa.space_id = v_s.id and pa.user_id = p_user) then
    return pg_catalog.jsonb_build_object('ok', true, 'already_member', true, 'space_id', v_s.id, 'slug', v_s.slug);
  end if;

  if v_s.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: This Space is not accepting new participants.';
  end if;

  if v_s.join_policy = 'code' then
    if (
      select pg_catalog.count(*) from private.api_events e
      where e.subject = p_user::text and e.kind = 'join_code_failed'
        and e.created_at > pg_catalog.now() - interval '1 hour'
    ) >= 10 then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
    end if;
    select sc.join_code into v_secret from public.space_secrets sc where sc.space_id = v_s.id;
    v_given := pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
    if v_secret is null or v_given <> v_secret then
      insert into private.api_events (subject, kind) values (p_user::text, 'join_code_failed');
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'INVALID_CODE');
    end if;
  end if;

  insert into public.participations (space_id, user_id) values (v_s.id, p_user)
  on conflict (space_id, user_id) do nothing;

  return pg_catalog.jsonb_build_object('ok', true, 'already_member', false, 'space_id', v_s.id, 'slug', v_s.slug);
end
$$;

-- Real joins now delegate to the shared rules (behavior unchanged; grants kept).
create or replace function public.join_space(p_space_id uuid, p_code text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or private.current_scope() is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;
  return private.join_space_as(v_uid, p_space_id, p_code);
end
$$;

-- get_space now also reports how many participations are synthetic (seeded or
-- simulated) so the UI can label them honestly. Grants are preserved.
create or replace function public.get_space(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_scope  text := coalesce(private.current_scope(), 'prod');
  v_s      public.matching_spaces;
  v_member boolean;
  v_h      public.space_hackathon_details;
  v_c      public.space_course_details;
begin
  select * into v_s from public.matching_spaces s where s.slug = p_slug and s.scope = v_scope;
  if not found then
    return null;
  end if;
  if v_s.visibility = 'unlisted' and v_uid is null then
    return null;
  end if;

  v_member := exists (select 1 from public.participations pa where pa.space_id = v_s.id and pa.user_id = v_uid);
  select * into v_h from public.space_hackathon_details d where d.space_id = v_s.id;
  select * into v_c from public.space_course_details d where d.space_id = v_s.id;

  return pg_catalog.jsonb_build_object(
    'id', v_s.id, 'slug', v_s.slug, 'title', v_s.title, 'type', v_s.type,
    'status', v_s.status, 'visibility', v_s.visibility, 'join_policy', v_s.join_policy,
    'requires_code', v_s.join_policy = 'code',
    'verification', v_s.verification,
    'is_demo', v_s.scope <> 'prod',
    'min_team_size', v_s.min_team_size, 'max_team_size', v_s.max_team_size,
    'team_size_source', v_s.team_size_source, 'team_deadline_at', v_s.team_deadline_at,
    'created_at', v_s.created_at,
    'is_member', v_member,
    'participant_count', (select pg_catalog.count(*) from public.participations pa where pa.space_id = v_s.id),
    'synthetic_participant_count', (
      select pg_catalog.count(*) from public.participations pa
      where pa.space_id = v_s.id and pa.source in ('seed', 'simulated')),
    'recruiting_team_count', (
      select pg_catalog.count(*) from public.teams t
      where t.space_id = v_s.id and t.recruiting and t.status <> 'archived'),
    'hackathon', case when v_h.space_id is null then null else pg_catalog.jsonb_build_object(
      'edition_year', v_h.edition_year, 'organizer', v_h.organizer,
      'official_url', v_h.official_url, 'starts_at', v_h.starts_at, 'ends_at', v_h.ends_at,
      'timezone', v_h.timezone, 'format', v_h.format,
      'location', case when v_h.format = 'online' then null else v_h.location end,
      'rules_url', v_h.rules_url) end,
    'course', case when v_c.space_id is null then null else pg_catalog.jsonb_build_object(
      'university', v_c.university, 'term', v_c.term, 'course_code', v_c.course_code,
      'course_title', v_c.course_title, 'allowed_sections', v_c.allowed_sections,
      'assignment_name', v_c.assignment_name, 'assignment_key', v_c.assignment_key,
      'instructions_url', case when v_member then v_c.instructions_url else null end) end
  );
end
$$;

-- Search: an explicit edition year in the query is now a hard filter, so a search
-- for "TreeHacks 2027" never surfaces TreeHacks 2026 (spec: distinct editions).
-- Grants are preserved by CREATE OR REPLACE.
create or replace function public.search_spaces(
  p_type public.space_type default null,
  p_query text default null,
  p_limit integer default 24)
returns table (
  id uuid, slug text, title text, type public.space_type, status public.space_status,
  visibility public.space_visibility, join_policy public.join_policy,
  edition_year smallint, starts_at timestamptz, ends_at timestamptz, event_timezone text,
  format public.hackathon_format, organizer text,
  university text, term text, course_code text, assignment_name text, allowed_sections text[],
  min_team_size smallint, max_team_size smallint, team_size_source public.team_size_source,
  participant_count bigint, is_member boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with ctx as (
    select coalesce(private.current_scope(), 'prod') as scope,
           auth.uid() as uid,
           private.normalize_title(p_query) as q,
           private.normalize_text(p_query) as q_compact,
           -- An explicit edition year in the query is a hard filter (TreeHacks 2027 ≠ 2026).
           (pg_catalog.regexp_match(coalesce(p_query, ''), '(?:^|[^0-9])((?:19|20)[0-9]{2})(?:[^0-9]|$)'))[1]::integer as q_year
  )
  select s.id, s.slug, s.title, s.type, s.status, s.visibility, s.join_policy,
         h.edition_year, h.starts_at, h.ends_at, h.timezone, h.format, h.organizer,
         c.university, c.term, c.course_code, c.assignment_name, c.allowed_sections,
         s.min_team_size, s.max_team_size, s.team_size_source,
         (select pg_catalog.count(*) from public.participations pa where pa.space_id = s.id),
         exists (select 1 from public.participations pa where pa.space_id = s.id and pa.user_id = ctx.uid),
         s.created_at
  from public.matching_spaces s
  cross join ctx
  left join public.space_hackathon_details h on h.space_id = s.id
  left join public.space_course_details c on c.space_id = s.id
  where s.scope = ctx.scope
    and s.status <> 'archived'
    and (p_type is null or s.type = p_type)
    and (s.visibility = 'public'
         or exists (select 1 from public.participations pa where pa.space_id = s.id and pa.user_id = ctx.uid))
    and (
      ctx.q_year is null
      or (s.type = 'hackathon' and h.edition_year = ctx.q_year)
      or (s.type = 'course' and c.term ~ ('(^|[^0-9])' || ctx.q_year::text || '([^0-9]|$)'))
    )
    and (
      ctx.q = ''
      or s.title_normalized like '%' || ctx.q || '%'
      or pg_catalog.replace(s.title_normalized, ' ', '') like '%' || ctx.q_compact || '%'
      or extensions.similarity(s.title_normalized, ctx.q) > 0.3
    )
  order by
    case when ctx.q = '' then 0 else extensions.similarity(s.title_normalized, ctx.q) end desc,
    s.created_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 50)
$$;

-- ---------------------------------------------------------------------------
-- Lease validation for signed-in demo users (proxy.ts). Returns only a boolean
-- about the caller's OWN slot; prod users always get false.
-- ---------------------------------------------------------------------------
create function public.demo_lease_valid(p_token_hash text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scope text := private.current_scope();
begin
  if auth.uid() is null or v_scope is null or v_scope !~ '^demo:[0-9]{1,2}$' then
    return false;
  end if;
  return exists (
    select 1 from private.demo_slots d
    where d.slot = pg_catalog.substr(v_scope, 6)::smallint
      and d.lease_token_hash = p_token_hash
      and d.leased_until > pg_catalog.now()
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Service-role-only administration
-- ---------------------------------------------------------------------------

-- Seed: register synthetic personas (each must already be a synthetic profile in
-- this slot's scope).
create function public.demo_register_personas(p_slot integer, p_personas jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_scope text := private.demo_scope(p_slot);
  r       record;
  n       integer := 0;
begin
  for r in
    select * from pg_catalog.jsonb_to_recordset(p_personas)
      as x(persona_key text, user_id uuid, switchable boolean)
  loop
    if not exists (
      select 1 from public.profiles p where p.id = r.user_id and p.scope = v_scope and p.is_synthetic
    ) then
      raise exception using errcode = 'P0001',
        message = 'DEMO_SCOPE_VIOLATION: persona ' || r.persona_key || ' is not a synthetic profile in ' || v_scope;
    end if;
    insert into private.demo_personas (slot, persona_key, user_id, switchable)
    values (p_slot, r.persona_key, r.user_id, coalesce(r.switchable, false))
    on conflict (slot, persona_key) do update
      set user_id = excluded.user_id, switchable = excluded.switchable;
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Lease management (one lease per slot; a new start replaces the old lease, which
-- invalidates the previous holder's session on their next request).
create function public.demo_start_lease(p_slot integer, p_token_hash text, p_minutes integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_until timestamptz;
  v_epoch integer;
begin
  perform private.demo_scope(p_slot);
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: bad token hash.';
  end if;
  if p_minutes is null or p_minutes not between 5 and 480 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: lease length must be 5–480 minutes.';
  end if;
  v_until := pg_catalog.now() + pg_catalog.make_interval(mins => p_minutes);
  insert into private.demo_slots (slot, lease_token_hash, leased_until, epoch, updated_at)
  values (p_slot, p_token_hash, v_until, 1, pg_catalog.now())
  on conflict (slot) do update
    set lease_token_hash = excluded.lease_token_hash,
        leased_until = excluded.leased_until,
        epoch = private.demo_slots.epoch + 1,
        updated_at = pg_catalog.now()
  returning epoch into v_epoch;
  return pg_catalog.jsonb_build_object('slot', p_slot, 'leased_until', v_until, 'epoch', v_epoch);
end
$$;

create function public.demo_check_lease(p_slot integer, p_token_hash text)
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
  if not found or v_d.lease_token_hash is null or v_d.lease_token_hash <> p_token_hash
     or v_d.leased_until <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('valid', false);
  end if;
  return pg_catalog.jsonb_build_object('valid', true, 'leased_until', v_d.leased_until, 'epoch', v_d.epoch);
end
$$;

create function public.demo_end_lease(p_slot integer, p_token_hash text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.demo_scope(p_slot);
  update private.demo_slots d
     set lease_token_hash = null, leased_until = null, updated_at = pg_catalog.now()
   where d.slot = p_slot and d.lease_token_hash = p_token_hash;
  return found;
end
$$;

-- Throttling for the unauthenticated bootstrap (subject = salted IP hash).
create function public.demo_rate_exceeded(p_subject text, p_kind text, p_max integer, p_window_minutes integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    select pg_catalog.count(*) from private.api_events e
    where e.subject = p_subject and e.kind = p_kind
      and e.created_at > pg_catalog.now() - pg_catalog.make_interval(mins => p_window_minutes)
  ) >= p_max
$$;

create function public.demo_rate_record(p_subject text, p_kind text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into private.api_events (subject, kind) values (p_subject, p_kind)
$$;

-- Reset: wipe ONLY this slot's Space data and reload the synthetic fixture.
-- Atomic (single transaction). Profiles are only updated where scope matches.
create function public.demo_reset_slot(p_slot integer, p_fixture jsonb)
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

  return pg_catalog.jsonb_build_object(
    'scope', v_scope, 'personas', v_n_people, 'participations', v_n_part, 'spaces', v_spaces);
end
$$;

-- Simulate synthetic personas joining a demo Space THROUGH the normal join rules
-- (scope, status, policy, join code), then mark them as simulated participants
-- who have opted in, so they are usable as candidates.
create function public.demo_simulate_joins(p_slot integer, p_space_id uuid, p_count integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_scope  text := private.demo_scope(p_slot);
  v_s      public.matching_spaces;
  v_code   text;
  v_res    jsonb;
  v_joined integer := 0;
  r        record;
begin
  if p_count is null or p_count not between 1 and 40 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: count must be 1–40.';
  end if;
  select * into v_s from public.matching_spaces s where s.id = p_space_id and s.scope = v_scope;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND: Space not found in this demo sandbox.';
  end if;
  select sc.join_code into v_code from public.space_secrets sc where sc.space_id = v_s.id;

  for r in
    select dp.user_id, dp.hackathon_goal, dp.course_goal, p.roles, p.interests
    from private.demo_personas dp
    join public.profiles p on p.id = dp.user_id
    where dp.slot = p_slot and p.scope = v_scope and p.is_synthetic
      and not exists (select 1 from public.participations pa where pa.space_id = v_s.id and pa.user_id = dp.user_id)
    order by dp.sim_rank, dp.persona_key
    limit p_count
  loop
    -- A classmate would have received the code from someone in the Space.
    v_res := private.join_space_as(r.user_id, v_s.id, v_code);
    if (v_res ->> 'ok')::boolean and not (v_res ->> 'already_member')::boolean then
      update public.participations pa
         set goal = case when v_s.type = 'hackathon' then r.hackathon_goal else r.course_goal end,
             desired_roles = r.roles[1:2],
             topics = r.interests[1:4],
             looking_for_team = true, accept_invites = true, smart_match_opt_in = true,
             visible_to_members = true, setup_completed = true, source = 'simulated'
       where pa.space_id = v_s.id and pa.user_id = r.user_id;
      v_joined := v_joined + 1;
    end if;
  end loop;

  return pg_catalog.jsonb_build_object(
    'joined', v_joined,
    'participant_count', (select pg_catalog.count(*) from public.participations pa where pa.space_id = v_s.id));
end
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'private.demo_scope(integer)',
    'private.join_space_as(uuid, uuid, text)',
    'public.demo_lease_valid(text)',
    'public.demo_register_personas(integer, jsonb)',
    'public.demo_start_lease(integer, text, integer)',
    'public.demo_check_lease(integer, text)',
    'public.demo_end_lease(integer, text)',
    'public.demo_rate_exceeded(text, text, integer, integer)',
    'public.demo_rate_record(text, text)',
    'public.demo_reset_slot(integer, jsonb)',
    'public.demo_simulate_joins(integer, uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end
$$;

-- Signed-in users may only ask "is MY demo lease valid?".
grant execute on function public.demo_lease_valid(text) to authenticated;

-- Administration: service role only (server-side demo routes and seed script).
grant execute on function public.demo_register_personas(integer, jsonb)           to service_role;
grant execute on function public.demo_start_lease(integer, text, integer)          to service_role;
grant execute on function public.demo_check_lease(integer, text)                   to service_role;
grant execute on function public.demo_end_lease(integer, text)                     to service_role;
grant execute on function public.demo_rate_exceeded(text, text, integer, integer)  to service_role;
grant execute on function public.demo_rate_record(text, text)                      to service_role;
grant execute on function public.demo_reset_slot(integer, jsonb)                   to service_role;
grant execute on function public.demo_simulate_joins(integer, uuid, integer)       to service_role;
