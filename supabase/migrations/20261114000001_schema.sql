-- TrojanMatch 0001 — schema, enums, constraints, indexes.
-- Source of truth: docs/IMPLEMENTATION_PLAN.md §B.
-- RLS policies and grants live in 0002. RPCs arrive in later phases.

create extension if not exists pg_trgm with schema extensions;

create schema if not exists private;
comment on schema private is
  'Helpers, internal tables and demo functions. NOT exposed through PostgREST.';

-- ---------------------------------------------------------------------------
-- Enums & domains
-- ---------------------------------------------------------------------------
create type public.space_type        as enum ('hackathon', 'course');
create type public.space_status      as enum ('open', 'closed', 'archived');
create type public.space_visibility  as enum ('public', 'unlisted');
create type public.join_policy       as enum ('open', 'code');
create type public.team_status       as enum ('draft', 'forming', 'active', 'archived');
create type public.team_member_role  as enum ('owner', 'member');
create type public.member_status     as enum ('active', 'left');
create type public.invite_kind       as enum ('invite', 'request');
create type public.invite_status     as enum ('pending', 'accepted', 'declined', 'cancelled', 'expired');
create type public.hackathon_format  as enum ('in_person', 'online', 'hybrid');
create type public.experience_level  as enum ('beginner', 'intermediate', 'advanced');
create type public.team_size_source  as enum ('creator_stated', 'app_default');
create type public.activation_mode   as enum ('auto', 'finalized');
create type public.match_mode        as enum ('form', 'grow', 'replace', 'find');
create type public.ai_source         as enum ('llm', 'template');

-- 'prod' for real users; 'demo:<slot>' for synthetic sandboxes (slot 0 = presenter).
create domain public.scope_text as text
  check (value = 'prod' or value ~ '^demo:[0-9]{1,2}$');

-- ---------------------------------------------------------------------------
-- Pure helpers needed by CHECK constraints (immutable, no table access)
-- ---------------------------------------------------------------------------
create function private.valid_hours(h smallint[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(pg_catalog.bool_and(x between 0 and 167), true)
  from pg_catalog.unnest(h) as x
$$;

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

-- ---------------------------------------------------------------------------
-- Profiles (1 per auth user). Email intentionally NOT copied here.
-- No protected attributes exist anywhere in this schema.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  scope         public.scope_text not null default 'prod',
  display_name  text not null check (char_length(display_name) between 1 and 60),
  university    text check (char_length(university) <= 120),
  bio           text check (char_length(bio) <= 1000),
  skills        text[] not null default '{}',
  roles         text[] not null default '{}',
  interests     text[] not null default '{}',
  experience    public.experience_level,
  working_style jsonb not null default '{}'::jsonb,
  availability  smallint[] not null default '{}',
  timezone      text not null default 'America/Los_Angeles' check (char_length(timezone) <= 64),
  onboarded     boolean not null default false,
  is_synthetic  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_tag_limits check (
    cardinality(skills) <= 40 and cardinality(roles) <= 10 and cardinality(interests) <= 30
  ),
  constraint profiles_availability_hours check (private.valid_hours(availability)),
  constraint profiles_working_style_object check (jsonb_typeof(working_style) = 'object')
);
create index profiles_scope_idx on public.profiles (scope);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Matching Spaces
-- created_by is informational ONLY: no policy or RPC grants privileges from it.
-- ---------------------------------------------------------------------------
create table public.matching_spaces (
  id                uuid primary key default gen_random_uuid(),
  scope             public.scope_text not null,
  type              public.space_type not null,
  title             text not null check (char_length(title) between 3 and 140),
  title_normalized  text not null,
  slug              text not null unique check (slug ~ '^[a-z0-9-]{6,80}$'),
  identity_key      text not null check (char_length(identity_key) between 3 and 400),
  created_by        uuid references public.profiles (id) on delete set null,
  status            public.space_status not null default 'open',
  visibility        public.space_visibility not null,
  join_policy       public.join_policy not null,
  verification      text not null default 'community' check (verification = 'community'),
  min_team_size     smallint not null default 2 check (min_team_size between 1 and 20),
  max_team_size     smallint not null default 4 check (max_team_size between 1 and 20),
  team_size_source  public.team_size_source not null default 'app_default',
  team_deadline_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint matching_spaces_size_order check (max_team_size >= min_team_size),
  constraint matching_spaces_id_scope_key unique (id, scope),
  constraint matching_spaces_scope_identity_key unique (scope, identity_key)
);
create index matching_spaces_scope_type_status_idx on public.matching_spaces (scope, type, status);
create index matching_spaces_title_trgm_idx on public.matching_spaces
  using gin (title_normalized extensions.gin_trgm_ops);
create trigger matching_spaces_updated_at before update on public.matching_spaces
  for each row execute function private.set_updated_at();

-- Hackathon metadata. scope is denormalized and pinned to the parent Space by a
-- composite FK so URL+year uniqueness is per scope (prod and demo never collide).
create table public.space_hackathon_details (
  space_id                 uuid primary key,
  scope                    public.scope_text not null,
  edition_year             smallint not null check (edition_year between 2000 and 2100),
  organizer                text check (char_length(organizer) <= 140),
  official_url             text check (official_url ~* '^https?://' and char_length(official_url) <= 500),
  official_url_normalized  text check (char_length(official_url_normalized) <= 500),
  starts_at                timestamptz not null,
  ends_at                  timestamptz not null,
  timezone                 text not null check (char_length(timezone) <= 64),
  format                   public.hackathon_format not null,
  location                 text check (char_length(location) <= 200),
  rules_url                text check (rules_url ~* '^https?://' and char_length(rules_url) <= 500),
  constraint space_hackathon_details_space_fk foreign key (space_id, scope)
    references public.matching_spaces (id, scope) on delete cascade,
  constraint space_hackathon_details_dates check (ends_at >= starts_at),
  constraint space_hackathon_details_url_pair check (
    (official_url is null) = (official_url_normalized is null)
  )
);
create unique index space_hackathon_details_scope_url_year_uq
  on public.space_hackathon_details (scope, official_url_normalized, edition_year)
  where official_url_normalized is not null;

create table public.space_course_details (
  space_id          uuid primary key,
  scope             public.scope_text not null,
  university        text not null check (char_length(university) between 2 and 120),
  term              text not null check (char_length(term) between 3 and 40),
  course_code       text not null check (char_length(course_code) between 2 and 30),
  course_title      text check (char_length(course_title) <= 140),
  allowed_sections  text[] not null check (cardinality(allowed_sections) between 1 and 20),
  assignment_name   text not null check (char_length(assignment_name) between 2 and 140),
  assignment_key    text check (char_length(assignment_key) <= 60),
  instructions_url  text check (instructions_url ~* '^https?://' and char_length(instructions_url) <= 500),
  constraint space_course_details_space_fk foreign key (space_id, scope)
    references public.matching_spaces (id, scope) on delete cascade
);

-- Join codes: RLS enabled with NO policies (0002) — readable only via audited RPCs.
create table public.space_secrets (
  space_id   uuid primary key references public.matching_spaces (id) on delete cascade,
  join_code  text not null check (join_code ~ '^[A-HJ-NP-Z2-9]{8}$')
);

-- ---------------------------------------------------------------------------
-- Participation (Space-specific preferences + consent). Consent defaults OFF.
-- ---------------------------------------------------------------------------
create table public.participations (
  id                     uuid primary key default gen_random_uuid(),
  space_id               uuid not null references public.matching_spaces (id) on delete cascade,
  user_id                uuid not null references public.profiles (id) on delete cascade,
  goal                   text check (goal in (
                           'competitive', 'build', 'learn',              -- hackathon
                           'aim_a', 'learn_deeply', 'meet_requirements'  -- course
                         )),
  goal_note              text check (char_length(goal_note) <= 280),
  desired_roles          text[] not null default '{}' check (cardinality(desired_roles) <= 10),
  topics                 text[] not null default '{}' check (cardinality(topics) <= 20),
  availability_override  smallint[] check (private.valid_hours(availability_override)),
  looking_for_team       boolean not null default false,
  accept_invites         boolean not null default false,
  smart_match_opt_in     boolean not null default false,
  visible_to_members     boolean not null default false,
  setup_completed        boolean not null default false,
  notes                  text check (char_length(notes) <= 500),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint participations_space_user_key unique (space_id, user_id)
);
create index participations_user_idx on public.participations (user_id);
create trigger participations_updated_at before update on public.participations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Teams. Pending state lives ONLY in invitations; team_members = accepted only.
-- ---------------------------------------------------------------------------
create table public.teams (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.matching_spaces (id) on delete cascade,
  owner_id         uuid not null,
  name             text not null check (char_length(name) between 2 and 60),
  description      text check (char_length(description) <= 500),
  status           public.team_status not null default 'draft',
  recruiting       boolean not null default true,
  target_size      smallint not null check (target_size between 2 and 20),
  requirements     jsonb not null default '{}'::jsonb check (jsonb_typeof(requirements) = 'object'),
  activation_mode  public.activation_mode,
  activated_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint teams_id_space_key unique (id, space_id),
  constraint teams_owner_participant_fk foreign key (space_id, owner_id)
    references public.participations (space_id, user_id) on delete cascade,
  constraint teams_active_has_activation check (
    status not in ('active') or (activated_at is not null and activation_mode is not null)
  )
);
create index teams_space_status_recruiting_idx on public.teams (space_id, status, recruiting);
create trigger teams_updated_at before update on public.teams
  for each row execute function private.set_updated_at();

create table public.team_members (
  team_id      uuid not null,
  space_id     uuid not null,
  user_id      uuid not null,
  role         public.team_member_role not null default 'member',
  can_recruit  boolean not null default false,
  status       public.member_status not null default 'active',
  joined_at    timestamptz not null default now(),
  left_at      timestamptz,
  primary key (team_id, user_id),
  constraint team_members_team_space_fk foreign key (team_id, space_id)
    references public.teams (id, space_id) on delete cascade,
  -- Every member must be a participant of the SAME Space.
  constraint team_members_participant_fk foreign key (space_id, user_id)
    references public.participations (space_id, user_id) on delete cascade,
  constraint team_members_left_at check ((status = 'left') = (left_at is not null))
);
-- One active team per user per Space (also the backstop for accept races).
create unique index team_members_one_active_team_per_space_uq
  on public.team_members (space_id, user_id) where status = 'active';
create index team_members_user_idx on public.team_members (user_id);

-- ---------------------------------------------------------------------------
-- Match runs (audit / reproducibility / explanation cache)
-- ---------------------------------------------------------------------------
create table public.match_runs (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.matching_spaces (id) on delete cascade,
  initiator_id       uuid not null,
  mode               public.match_mode not null,
  input              jsonb not null,
  result             jsonb not null,
  candidate_count    integer not null check (candidate_count >= 0),
  algorithm_version  text not null,
  created_at         timestamptz not null default now(),
  constraint match_runs_initiator_participant_fk foreign key (space_id, initiator_id)
    references public.participations (space_id, user_id) on delete cascade
);
create index match_runs_initiator_idx on public.match_runs (initiator_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Invitations (invite: team -> student, request: student -> team)
-- ---------------------------------------------------------------------------
create table public.invitations (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null,
  team_id        uuid not null,
  kind           public.invite_kind not null,
  user_id        uuid not null,   -- the student (invitee or requester)
  actor_id       uuid not null,   -- who created it
  status         public.invite_status not null default 'pending',
  status_reason  text check (char_length(status_reason) <= 40),
  message        text check (char_length(message) <= 280),
  expires_at     timestamptz not null,
  responded_by   uuid references public.profiles (id) on delete set null,
  responded_at   timestamptz,
  match_run_id   uuid references public.match_runs (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint invitations_team_space_fk foreign key (team_id, space_id)
    references public.teams (id, space_id) on delete cascade,
  constraint invitations_user_participant_fk foreign key (space_id, user_id)
    references public.participations (space_id, user_id) on delete cascade,
  constraint invitations_actor_participant_fk foreign key (space_id, actor_id)
    references public.participations (space_id, user_id) on delete cascade,
  constraint invitations_request_by_self check (kind <> 'request' or actor_id = user_id),
  constraint invitations_no_self_invite check (kind <> 'invite' or actor_id <> user_id)
);
create unique index invitations_one_pending_per_team_user_uq
  on public.invitations (team_id, user_id) where status = 'pending';
create index invitations_space_user_status_idx on public.invitations (space_id, user_id, status);
create index invitations_team_status_idx on public.invitations (team_id, status);
create trigger invitations_updated_at before update on public.invitations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Team workspace
-- ---------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000 and btrim(body) <> ''),
  client_id   uuid,
  created_at  timestamptz not null default now(),
  constraint messages_team_client_key unique (team_id, client_id)
);
create index messages_team_created_idx on public.messages (team_id, created_at);

create table public.kickoff_briefs (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams (id) on delete cascade,
  brief         jsonb not null check (jsonb_typeof(brief) = 'object'),
  source        public.ai_source not null,
  generated_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index kickoff_briefs_team_idx on public.kickoff_briefs (team_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Private tables (never exposed)
-- ---------------------------------------------------------------------------
create table private.app_config (
  key    text primary key,
  value  jsonb not null
);
-- Empty list = no domain restriction. This is a spam filter, NOT identity proof.
insert into private.app_config (key, value) values ('allowed_email_domains', '[]'::jsonb);

create table private.api_events (
  id          bigint generated always as identity primary key,
  subject     text not null,     -- user id or hashed IP
  kind        text not null,
  created_at  timestamptz not null default now()
);
create index api_events_subject_kind_created_idx on private.api_events (subject, kind, created_at desc);

create table private.demo_slots (
  slot              smallint primary key check (slot between 0 and 20),
  lease_token_hash  text,
  leased_until      timestamptz,
  epoch             integer not null default 0,
  updated_at        timestamptz not null default now()
);
insert into private.demo_slots (slot) values (0);  -- presenter slot

-- ---------------------------------------------------------------------------
-- Auth hook: create profile on sign-up. Scope comes from app_metadata, which
-- only the service role can set; anything else is 'prod'.
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope    text := coalesce(new.raw_app_meta_data ->> 'scope', 'prod');
  v_domains  jsonb;
  v_domain   text;
  v_name     text;
begin
  if not (v_scope = 'prod' or v_scope ~ '^demo:[0-9]{1,2}$') then
    raise exception 'INVALID_SCOPE' using errcode = 'P0001';
  end if;

  -- NOTE: the GoTrue admin API writes app_metadata in a follow-up UPDATE, so at
  -- INSERT time scope is usually 'prod'; private.sync_profile_scope applies it.
  v_domain := pg_catalog.lower(pg_catalog.split_part(new.email, '@', 2));
  -- Reserved, undeliverable TLDs (RFC 2606/6761) can never be confirmed by a
  -- self sign-up, so they are exempt (used by seeded demo/dev accounts).
  if v_scope = 'prod' and v_domain !~ '\.(test|invalid)$' then
    select c.value into v_domains from private.app_config c where c.key = 'allowed_email_domains';
    if v_domains is not null and pg_catalog.jsonb_array_length(v_domains) > 0 then
      if not exists (
        select 1 from pg_catalog.jsonb_array_elements_text(v_domains) as d(dom)
        where pg_catalog.lower(d.dom) = v_domain
      ) then
        raise exception 'EMAIL_DOMAIN_NOT_ALLOWED' using errcode = 'P0001';
      end if;
    end if;
  end if;

  v_name := coalesce(
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    pg_catalog.split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, scope, display_name, is_synthetic)
  values (
    new.id,
    v_scope,
    pg_catalog.left(v_name, 60),
    coalesce((new.raw_app_meta_data ->> 'is_synthetic')::boolean, false)
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Applies service-set app_metadata (scope / is_synthetic) to the profile.
-- Only the service role can change app_metadata. A user who already has Space
-- data is never moved across scopes.
create function private.sync_profile_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope      text    := coalesce(new.raw_app_meta_data ->> 'scope', 'prod');
  v_synthetic  boolean := coalesce((new.raw_app_meta_data ->> 'is_synthetic')::boolean, false);
  v_current    record;
begin
  select p.scope::text as scope, p.is_synthetic into v_current
  from public.profiles p where p.id = new.id;
  if not found then
    return new;
  end if;
  if v_current.scope = v_scope and v_current.is_synthetic = v_synthetic then
    return new;
  end if;
  if not (v_scope = 'prod' or v_scope ~ '^demo:[0-9]{1,2}$') then
    raise exception 'INVALID_SCOPE' using errcode = 'P0001';
  end if;
  if v_current.scope <> v_scope
     and exists (select 1 from public.participations pa where pa.user_id = new.id) then
    raise exception 'SCOPE_LOCKED: user already has Space data in another scope' using errcode = 'P0001';
  end if;
  update public.profiles
     set scope = v_scope, is_synthetic = v_synthetic
   where id = new.id;
  return new;
end
$$;

create trigger on_auth_user_app_metadata_changed
  after update of raw_app_meta_data on auth.users
  for each row execute function private.sync_profile_scope();
