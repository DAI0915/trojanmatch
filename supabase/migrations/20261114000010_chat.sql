-- TrojanMatch 0010 — Team chat (Realtime) and AI Kickoff limits (P6).
--
-- Access rules are UNCHANGED (0002): messages and kickoff briefs are readable and
-- writable only by ACCEPTED members of an ACTIVE team (RLS via
-- private.is_active_member + private.team_is_active). Space creators, pending
-- invitees, declined candidates and other teams get nothing. No UPDATE/DELETE.
--
-- Adds:
--   * public.messages in the supabase_realtime publication (Realtime enforces the
--     same SELECT policy per subscriber)
--   * BEFORE INSERT trigger on messages: author is always the caller, body is
--     trimmed (1–2000 chars), per-author rate limit (20 / minute)
--   * BEFORE INSERT trigger on kickoff_briefs: author is always the caller,
--     per-team rate limit (6 / hour), brief size cap (32 KB)
--   * index for the per-author rate limit
-- No existing table, column, policy, function or row is changed.

create index if not exists messages_author_created_idx on public.messages (author_id, created_at desc);

create function private.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Service role / owner inserts (none in the app) keep their explicit author.
  if v_uid is not null then
    new.author_id := v_uid;
    if (
      select pg_catalog.count(*) from public.messages m
      where m.author_id = v_uid and m.created_at > pg_catalog.now() - interval '1 minute'
    ) >= 20 then
      raise exception using errcode = 'P0001', message = 'RATE_LIMITED: You are sending messages too quickly. Wait a moment.';
    end if;
  end if;
  new.body := pg_catalog.btrim(new.body);
  new.created_at := pg_catalog.now();
  return new;
end
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function private.messages_before_insert();

create function private.kickoff_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is not null then
    new.generated_by := v_uid;
  end if;
  if pg_catalog.octet_length(new.brief::text) > 32768 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: Kickoff brief is too large.';
  end if;
  if (
    select pg_catalog.count(*) from public.kickoff_briefs k
    where k.team_id = new.team_id and k.created_at > pg_catalog.now() - interval '1 hour'
  ) >= 6 then
    raise exception using errcode = 'P0001', message = 'RATE_LIMITED: This team generated several kickoffs in the last hour. Try again later.';
  end if;
  new.created_at := pg_catalog.now();
  return new;
end
$$;

create trigger kickoff_briefs_before_insert
  before insert on public.kickoff_briefs
  for each row execute function private.kickoff_before_insert();

revoke all on function private.messages_before_insert() from public, anon, authenticated;
revoke all on function private.kickoff_before_insert()  from public, anon, authenticated;

-- Realtime: broadcast message inserts; each subscriber only receives rows its
-- RLS SELECT policy allows (accepted members of the active team).
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
