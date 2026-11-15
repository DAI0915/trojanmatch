-- TrojanMatch 0003 — Matching Space discovery, creation, joining (P2).
-- Rules (docs/IMPLEMENTATION_PLAN.md §G2): SECURITY DEFINER + search_path = '',
-- schema-qualified names, auth.uid() checked first, no caller-supplied actor ids,
-- EXECUTE revoked by default and granted explicitly below.
--
-- Error convention: RAISE EXCEPTION 'CODE: human message' (mapped by
-- lib/api/errors.ts). Failures that must PERSIST a rate-limit record (wrong join
-- codes) are returned as {ok:false,error} instead of raised, because raising
-- would roll the record back.

-- ---------------------------------------------------------------------------
-- Pure helpers (private, IMMUTABLE)
-- ---------------------------------------------------------------------------

-- Compact identity form: lowercase alphanumerics only ("Tree Hacks" = "treehacks").
create function private.normalize_text(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.regexp_replace(pg_catalog.lower(coalesce(t, '')), '[^a-z0-9]+', '', 'g')
$$;

-- Searchable form: lowercase alphanumerics separated by single spaces.
create function private.normalize_title(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(coalesce(t, '')), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Official URL identity: scheme-insensitive, no www, no fragment, no tracking
-- params, no trailing slash, lowercase. Returns NULL for blank input.
create function private.normalize_url(u text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if u is null or pg_catalog.btrim(u) = '' then
    return null;
  end if;
  v := pg_catalog.lower(pg_catalog.btrim(u));
  v := pg_catalog.regexp_replace(v, '#.*$', '');
  v := pg_catalog.regexp_replace(v, '^[a-z][a-z0-9+.-]*://', '');
  v := pg_catalog.regexp_replace(v, '^www\.', '');
  v := pg_catalog.regexp_replace(v, '([?&])(utm_[a-z_]+|ref|fbclid|gclid|mc_cid|mc_eid)=[^&]*', '\1', 'g');
  v := pg_catalog.regexp_replace(v, '&&+', '&', 'g');
  v := pg_catalog.regexp_replace(v, '\?&+', '?');
  v := pg_catalog.regexp_replace(v, '[?&]+$', '');
  v := pg_catalog.regexp_replace(v, '/+(\?|$)', '\1');
  return 'https://' || v;
end
$$;

-- "Section 1" = "Sec 1" = "1".
create function private.normalize_section(s text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.regexp_replace(private.normalize_text(s), '^(section|sect|sec)', '')
$$;

-- Hackathon identity = event name without the edition year + edition year.
-- "TreeHacks 2027", "Tree Hacks" (2027) and "TREEHACKS-2027" all collide;
-- TreeHacks 2026 vs 2027 never do.
create function private.hackathon_identity_key(p_name text, p_year integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'h|'
    || private.normalize_text(
         pg_catalog.regexp_replace(coalesce(p_name, ''), '(^|[^0-9])' || p_year::text || '([^0-9]|$)', '\1\2', 'g'))
    || '|' || p_year::text
$$;

-- Course identity = university + term + course code + assignment + section set.
create function private.course_identity_key(
  p_university text, p_term text, p_course_code text, p_assignment text, p_sections text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select 'c|' || private.normalize_text(p_university)
    || '|' || private.normalize_text(p_term)
    || '|' || private.normalize_text(p_course_code)
    || '|' || private.normalize_text(p_assignment)
    || '|' || coalesce((
         select pg_catalog.string_agg(distinct x, ',' order by x)
         from (select private.normalize_section(s) as x from pg_catalog.unnest(p_sections) as s) q
         where x <> ''
       ), '')
$$;

create function private.slugify(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.left(
    pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g'), '-'),
    48)
$$;

-- Unbiased random string (alphabet length must divide 256: we use 32 symbols).
create function private.random_string(p_len integer, p_alphabet text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  b bytea := extensions.gen_random_bytes(p_len);
  n integer := pg_catalog.length(p_alphabet);
  r text := '';
begin
  if 256 % n <> 0 then
    raise exception 'alphabet length must divide 256';
  end if;
  for i in 0 .. p_len - 1 loop
    r := r || pg_catalog.substr(p_alphabet, (pg_catalog.get_byte(b, i) % n) + 1, 1);
  end loop;
  return r;
end
$$;

-- Raises RATE_LIMITED when the window is full; otherwise records the event.
create function private.rate_limit_hit(p_subject text, p_kind text, p_max integer, p_window interval)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  if (
    select pg_catalog.count(*) from private.api_events e
    where e.subject = p_subject and e.kind = p_kind and e.created_at > pg_catalog.now() - p_window
  ) >= p_max then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED: Too many attempts. Please try again later.';
  end if;
  insert into private.api_events (subject, kind) values (p_subject, p_kind);
end
$$;

-- Identity facts derived from a create/check payload (no validation beyond what
-- identity needs; create_space validates everything).
create function private.space_identity(p jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_type text := p ->> 'type';
  v_year integer;
  v_sections text[];
begin
  if v_type = 'hackathon' then
    v_year := nullif(p ->> 'edition_year', '')::integer;
    return pg_catalog.jsonb_build_object(
      'type', v_type,
      'identity_key', private.hackathon_identity_key(p ->> 'title', v_year),
      'url_normalized', private.normalize_url(p ->> 'official_url'),
      'edition_year', v_year,
      'title_normalized', private.normalize_title(p ->> 'title'));
  elsif v_type = 'course' then
    select coalesce(pg_catalog.array_agg(x), '{}') into v_sections
    from pg_catalog.jsonb_array_elements_text(coalesce(p -> 'allowed_sections', '[]'::jsonb)) as x;
    return pg_catalog.jsonb_build_object(
      'type', v_type,
      'identity_key', private.course_identity_key(
        p ->> 'university', p ->> 'term', p ->> 'course_code',
        coalesce(nullif(pg_catalog.btrim(p ->> 'assignment_key'), ''), p ->> 'assignment_name'),
        v_sections),
      'term_normalized', private.normalize_text(p ->> 'term'),
      'title_normalized', private.normalize_title(
        concat_ws(' ', p ->> 'course_code', p ->> 'assignment_name', p ->> 'term')));
  end if;
  raise exception using errcode = 'P0001', message = 'INVALID_INPUT: type must be hackathon or course.';
end
$$;

-- ---------------------------------------------------------------------------
-- search_spaces — public discovery (anon + authenticated).
-- Scope-isolated; unlisted Spaces only appear to their participants.
-- participant_count is a real count (DEFINER: RLS would hide other rows).
-- ---------------------------------------------------------------------------
create function public.search_spaces(
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
           private.normalize_text(p_query) as q_compact
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
-- get_space — Space detail by slug. Metadata + real counts only; never rosters
-- or join codes. Unlisted Spaces require sign-in (the slug acts as the link).
-- ---------------------------------------------------------------------------
create function public.get_space(p_slug text)
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
    'min_team_size', v_s.min_team_size, 'max_team_size', v_s.max_team_size,
    'team_size_source', v_s.team_size_source, 'team_deadline_at', v_s.team_deadline_at,
    'created_at', v_s.created_at,
    'is_member', v_member,
    'participant_count', (select pg_catalog.count(*) from public.participations pa where pa.space_id = v_s.id),
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
      -- Possibly private (e.g. Canvas) link: participants only.
      'instructions_url', case when v_member then v_c.instructions_url else null end) end
  );
end
$$;

-- ---------------------------------------------------------------------------
-- check_space_duplicates — pre-create review. Exact / URL matches are reported
-- even for unlisted Spaces (title + "requires code" only, no slug); "similar"
-- suggestions only include Spaces the caller could already discover.
-- ---------------------------------------------------------------------------
create function public.check_space_duplicates(p_payload jsonb)
returns table (
  space_id uuid, slug text, title text, type public.space_type,
  visibility public.space_visibility, match_kind text, requires_code boolean,
  is_member boolean, participant_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_scope text := private.current_scope();
  v_id    jsonb;
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;
  v_id := private.space_identity(p_payload);

  return query
  with matches as (
    select s.id, 'exact'::text as kind, 1 as rank
    from public.matching_spaces s
    where s.scope = v_scope and s.identity_key = v_id ->> 'identity_key'
    union all
    select s.id, 'url', 2
    from public.matching_spaces s
    join public.space_hackathon_details h on h.space_id = s.id
    where s.scope = v_scope
      and v_id ->> 'url_normalized' is not null
      and h.official_url_normalized = v_id ->> 'url_normalized'
      and h.edition_year = (v_id ->> 'edition_year')::integer
    union all
    select s.id, 'similar', 3
    from public.matching_spaces s
    left join public.space_hackathon_details h on h.space_id = s.id
    left join public.space_course_details c on c.space_id = s.id
    where s.scope = v_scope
      and s.type::text = v_id ->> 'type'
      and s.status <> 'archived'
      and extensions.similarity(s.title_normalized, v_id ->> 'title_normalized') > 0.45
      and (
        (s.type = 'hackathon' and h.edition_year = (v_id ->> 'edition_year')::integer)
        or (s.type = 'course' and private.normalize_text(c.term) = v_id ->> 'term_normalized')
      )
      and (s.visibility = 'public'
           or exists (select 1 from public.participations pa where pa.space_id = s.id and pa.user_id = v_uid))
  ),
  best as (
    select distinct on (m.id) m.id, m.kind, m.rank from matches m order by m.id, m.rank
  )
  select s.id,
         case when s.visibility = 'public' or mem.is_member then s.slug else null end,
         s.title, s.type, s.visibility, b.kind, s.join_policy = 'code', mem.is_member,
         (select pg_catalog.count(*) from public.participations pa where pa.space_id = s.id)
  from best b
  join public.matching_spaces s on s.id = b.id
  cross join lateral (
    select exists (select 1 from public.participations pa where pa.space_id = s.id and pa.user_id = v_uid) as is_member
  ) mem
  order by b.rank, s.created_at desc
  limit 8;
end
$$;

-- ---------------------------------------------------------------------------
-- create_space — any authenticated student. Space + details (+ join code) +
-- creator participation in ONE transaction. Never creates a team. The creator
-- gets no organizer/team privileges (created_by is informational only).
-- ---------------------------------------------------------------------------
create function public.create_space(p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_scope       text := private.current_scope();
  p             jsonb := coalesce(p_payload, '{}'::jsonb);
  v_type        public.space_type;
  v_id          jsonb;
  v_space_id    uuid := gen_random_uuid();
  v_title       text;
  v_slug        text;
  v_visibility  public.space_visibility;
  v_policy      public.join_policy;
  v_min         smallint := 2;
  v_max         smallint := 4;
  v_size_src    public.team_size_source := 'app_default'::public.team_size_source;
  v_tz          text;
  v_deadline    timestamptz;
  v_code        text;
  -- hackathon
  v_year        integer;
  v_start       date;
  v_end         date;
  v_format      public.hackathon_format;
  v_url         text;
  v_rules_url   text;
  v_organizer   text;
  v_location    text;
  -- course
  v_university  text;
  v_term        text;
  v_course_code text;
  v_course_title text;
  v_sections    text[];
  v_assignment  text;
  v_assign_key  text;
  v_instr_url   text;
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;
  perform private.rate_limit_hit(v_uid::text, 'create_space', 10, interval '1 hour');

  if p ->> 'type' not in ('hackathon', 'course') or p ->> 'type' is null then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: type must be hackathon or course.';
  end if;
  v_type := (p ->> 'type')::public.space_type;

  -- Visibility: course defaults to unlisted (+ join code), hackathon to public.
  v_visibility := coalesce(
    nullif(p ->> 'visibility', ''),
    case when v_type = 'course' then 'unlisted' else 'public' end)::public.space_visibility;
  v_policy := case when v_visibility = 'unlisted' then 'code' else 'open' end::public.join_policy;

  v_tz := coalesce(nullif(pg_catalog.btrim(p ->> 'timezone'), ''), 'America/Los_Angeles');
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Unknown time zone.';
  end if;

  -- Team size: creator-stated only when both bounds are given; else provisional.
  if nullif(p ->> 'min_team_size', '') is not null and nullif(p ->> 'max_team_size', '') is not null then
    v_min := (p ->> 'min_team_size')::smallint;
    v_max := (p ->> 'max_team_size')::smallint;
    if v_min < 1 or v_max > 20 or v_max < v_min or v_max < 2 then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Team size must be between 1 and 20 (max ≥ min, max ≥ 2).';
    end if;
    v_size_src := 'creator_stated';
  end if;

  if nullif(pg_catalog.btrim(p ->> 'team_deadline_local'), '') is not null then
    v_deadline := (p ->> 'team_deadline_local')::timestamp at time zone v_tz;
  end if;

  if v_type = 'hackathon' then
    v_title     := pg_catalog.btrim(p ->> 'title');
    v_year      := nullif(p ->> 'edition_year', '')::integer;
    v_start     := nullif(p ->> 'start_date', '')::date;
    v_end       := nullif(p ->> 'end_date', '')::date;
    v_format    := nullif(p ->> 'format', '')::public.hackathon_format;
    v_url       := nullif(pg_catalog.btrim(p ->> 'official_url'), '');
    v_rules_url := nullif(pg_catalog.btrim(p ->> 'rules_url'), '');
    v_organizer := nullif(pg_catalog.btrim(p ->> 'organizer'), '');
    v_location  := nullif(pg_catalog.btrim(p ->> 'location'), '');

    if v_title is null or pg_catalog.char_length(v_title) not between 3 and 120 then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Event name must be 3–120 characters.';
    end if;
    if v_year is null or v_year not between 2000 and 2100 then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Edition year is required.';
    end if;
    if v_start is null or v_end is null or v_end < v_start then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Start and end dates are required (end ≥ start).';
    end if;
    if v_format is null then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Format is required.';
    end if;
    if (v_url is not null and v_url !~* '^https?://[^\s/$.?#][^\s]*$')
       or (v_rules_url is not null and v_rules_url !~* '^https?://[^\s/$.?#][^\s]*$') then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: URLs must start with http:// or https://.';
    end if;
    if v_format = 'online' then
      v_location := null;  -- never publish online venue details
    end if;
    -- Display title always carries the edition year.
    if pg_catalog.strpos(v_title, v_year::text) = 0 then
      v_title := v_title || ' ' || v_year::text;
    end if;
  else
    v_university   := pg_catalog.btrim(p ->> 'university');
    v_term         := pg_catalog.btrim(p ->> 'term');
    v_course_code  := pg_catalog.upper(pg_catalog.regexp_replace(pg_catalog.btrim(p ->> 'course_code'), '\s+', ' ', 'g'));
    v_course_title := nullif(pg_catalog.btrim(p ->> 'course_title'), '');
    v_assignment   := pg_catalog.btrim(p ->> 'assignment_name');
    v_assign_key   := nullif(pg_catalog.btrim(p ->> 'assignment_key'), '');
    v_instr_url    := nullif(pg_catalog.btrim(p ->> 'instructions_url'), '');
    select coalesce(pg_catalog.array_agg(pg_catalog.btrim(x)) filter (where pg_catalog.btrim(x) <> ''), '{}')
      into v_sections
      from pg_catalog.jsonb_array_elements_text(coalesce(p -> 'allowed_sections', '[]'::jsonb)) as x;

    if v_university is null or pg_catalog.char_length(v_university) not between 2 and 120
       or v_term is null or pg_catalog.char_length(v_term) not between 3 and 40
       or v_course_code is null or pg_catalog.char_length(v_course_code) not between 2 and 30
       or v_assignment is null or pg_catalog.char_length(v_assignment) not between 2 and 140 then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: University, term, course code and assignment are required.';
    end if;
    if pg_catalog.cardinality(v_sections) not between 1 and 20 then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: List at least one section (or the sections allowed to team up).';
    end if;
    if v_instr_url is not null and v_instr_url !~* '^https?://[^\s/$.?#][^\s]*$' then
      raise exception using errcode = 'P0001', message = 'INVALID_INPUT: URLs must start with http:// or https://.';
    end if;
    v_title := pg_catalog.left(v_course_code || ' · ' || v_assignment || ' · ' || v_term, 140);
  end if;

  v_id := private.space_identity(p);

  -- Serialize concurrent creators of the same identity, then re-check.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_scope || '|' || (v_id ->> 'identity_key'), 0));
  if exists (select 1 from public.matching_spaces s where s.scope = v_scope and s.identity_key = v_id ->> 'identity_key') then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_SPACE: This Space already exists. Join it instead.';
  end if;
  if v_type = 'hackathon' and private.normalize_url(v_url) is not null and exists (
    select 1 from public.space_hackathon_details h
    where h.scope = v_scope and h.official_url_normalized = private.normalize_url(v_url) and h.edition_year = v_year
  ) then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_SPACE: A Space with this official URL and year already exists.';
  end if;

  v_slug := pg_catalog.btrim(private.slugify(v_title) || '-' || private.random_string(8, 'abcdefghijkmnpqrstuvwxyz23456789'), '-');

  insert into public.matching_spaces (
    id, scope, type, title, title_normalized, slug, identity_key, created_by,
    visibility, join_policy, min_team_size, max_team_size, team_size_source, team_deadline_at)
  values (
    v_space_id, v_scope, v_type, v_title, private.normalize_title(v_title), v_slug,
    v_id ->> 'identity_key', v_uid, v_visibility, v_policy, v_min, v_max, v_size_src, v_deadline);

  if v_type = 'hackathon' then
    insert into public.space_hackathon_details (
      space_id, scope, edition_year, organizer, official_url, official_url_normalized,
      starts_at, ends_at, timezone, format, location, rules_url)
    values (
      v_space_id, v_scope, v_year, v_organizer, v_url, private.normalize_url(v_url),
      v_start::timestamp at time zone v_tz,
      ((v_end + 1)::timestamp at time zone v_tz) - interval '1 second',
      v_tz, v_format, v_location, v_rules_url);
  else
    insert into public.space_course_details (
      space_id, scope, university, term, course_code, course_title, allowed_sections,
      assignment_name, assignment_key, instructions_url)
    values (
      v_space_id, v_scope, v_university, v_term, v_course_code, v_course_title, v_sections,
      v_assignment, v_assign_key, v_instr_url);
  end if;

  if v_policy = 'code' then
    v_code := private.random_string(8, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
    insert into public.space_secrets (space_id, join_code) values (v_space_id, v_code);
  end if;

  -- Creator becomes a participant (all consent flags default OFF). No team.
  insert into public.participations (space_id, user_id) values (v_space_id, v_uid);

  return pg_catalog.jsonb_build_object('space_id', v_space_id, 'slug', v_slug, 'join_code', v_code);
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'DUPLICATE_SPACE: This Space already exists. Join it instead.';
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow
       or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Some fields have an invalid format.';
end
$$;

-- ---------------------------------------------------------------------------
-- join_space — scope + status + join policy enforced here. Idempotent.
-- Wrong codes are recorded and returned (not raised) so the record persists.
-- ---------------------------------------------------------------------------
create function public.join_space(p_space_id uuid, p_code text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_scope  text := private.current_scope();
  v_s      public.matching_spaces;
  v_secret text;
  v_given  text;
begin
  if v_uid is null or v_scope is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;

  select * into v_s from public.matching_spaces s where s.id = p_space_id and s.scope = v_scope;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND: Space not found.';
  end if;

  if exists (select 1 from public.participations pa where pa.space_id = v_s.id and pa.user_id = v_uid) then
    return pg_catalog.jsonb_build_object('ok', true, 'already_member', true, 'space_id', v_s.id, 'slug', v_s.slug);
  end if;

  if v_s.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'SPACE_CLOSED: This Space is not accepting new participants.';
  end if;

  if v_s.join_policy = 'code' then
    if (
      select pg_catalog.count(*) from private.api_events e
      where e.subject = v_uid::text and e.kind = 'join_code_failed'
        and e.created_at > pg_catalog.now() - interval '1 hour'
    ) >= 10 then
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
    end if;
    select sc.join_code into v_secret from public.space_secrets sc where sc.space_id = v_s.id;
    v_given := pg_catalog.upper(pg_catalog.regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
    if v_secret is null or v_given <> v_secret then
      insert into private.api_events (subject, kind) values (v_uid::text, 'join_code_failed');
      return pg_catalog.jsonb_build_object('ok', false, 'error', 'INVALID_CODE');
    end if;
  end if;

  insert into public.participations (space_id, user_id) values (v_s.id, v_uid)
  on conflict (space_id, user_id) do nothing;

  return pg_catalog.jsonb_build_object('ok', true, 'already_member', false, 'space_id', v_s.id, 'slug', v_s.slug);
end
$$;

-- ---------------------------------------------------------------------------
-- get_invite_link — ANY participant (not just the creator) may share.
-- Non-participants never see join codes.
-- ---------------------------------------------------------------------------
create function public.get_invite_link(p_space_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_slug text;
  v_code text;
begin
  if v_uid is null then
    raise exception using errcode = '28000', message = 'NOT_AUTHENTICATED: Sign in required.';
  end if;
  if not exists (select 1 from public.participations pa where pa.space_id = p_space_id and pa.user_id = v_uid) then
    raise exception using errcode = 'P0001', message = 'NOT_PARTICIPANT: Join this Space to share it.';
  end if;
  select s.slug into v_slug from public.matching_spaces s where s.id = p_space_id;
  select sc.join_code into v_code from public.space_secrets sc where sc.space_id = p_space_id;
  return pg_catalog.jsonb_build_object('slug', v_slug, 'join_code', v_code);
end
$$;

-- ---------------------------------------------------------------------------
-- Grants (default EXECUTE is already revoked; be explicit anyway).
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'private.normalize_text(text)',
    'private.normalize_title(text)',
    'private.normalize_url(text)',
    'private.normalize_section(text)',
    'private.hackathon_identity_key(text, integer)',
    'private.course_identity_key(text, text, text, text, text[])',
    'private.slugify(text)',
    'private.random_string(integer, text)',
    'private.rate_limit_hit(text, text, integer, interval)',
    'private.space_identity(jsonb)',
    'public.search_spaces(public.space_type, text, integer)',
    'public.get_space(text)',
    'public.check_space_duplicates(jsonb)',
    'public.create_space(jsonb)',
    'public.join_space(uuid, text)',
    'public.get_invite_link(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end
$$;

grant execute on function public.search_spaces(public.space_type, text, integer) to anon, authenticated;
grant execute on function public.get_space(text)                                  to anon, authenticated;
grant execute on function public.check_space_duplicates(jsonb)                    to authenticated;
grant execute on function public.create_space(jsonb)                              to authenticated;
grant execute on function public.join_space(uuid, text)                           to authenticated;
grant execute on function public.get_invite_link(uuid)                            to authenticated;
