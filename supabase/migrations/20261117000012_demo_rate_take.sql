-- TrojanMatch 0012 — Demo throttle that can say WHEN it frees up.
--
-- public.demo_rate_take(subject, kind, max, window) is the atomic version of
-- demo_rate_exceeded + demo_rate_record (same ledger, same limits):
--   * serialized per subject+kind, so concurrent requests can't overshoot `max`;
--   * when the limit is reached it records nothing and returns the exact time the
--     oldest counted event leaves the window (retry_at), so the app can show an
--     accurate retry time / Retry-After. retry_at concerns only the caller's own
--     subject (a salted IP hash or a lease hash), nothing about other visitors.
--
-- Additive only: new function, EXECUTE service_role only. The old functions stay
-- (the previous app version still uses them). No data changes, no RLS changes.

create function public.demo_rate_take(p_subject text, p_kind text, p_max integer, p_window_minutes integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window interval;
  v_count  integer;
  v_retry  timestamptz;
begin
  if p_subject is null or p_kind is null or pg_catalog.length(p_subject) > 128 or pg_catalog.length(p_kind) > 64 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: bad throttle key.';
  end if;
  if p_max is null or p_max < 1 or p_window_minutes is null or p_window_minutes not between 1 and 1440 then
    raise exception using errcode = 'P0001', message = 'INVALID_INPUT: bad throttle limits.';
  end if;
  v_window := pg_catalog.make_interval(mins => p_window_minutes);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('trojanmatch.rate|' || p_kind || '|' || p_subject));

  select pg_catalog.count(*) into v_count
    from private.api_events e
   where e.subject = p_subject and e.kind = p_kind and e.created_at > pg_catalog.now() - v_window;

  if v_count >= p_max then
    -- Allowed again once the count drops below p_max, i.e. when the
    -- (v_count - p_max + 1)-th oldest counted event leaves the window.
    select e.created_at + v_window into v_retry
      from private.api_events e
     where e.subject = p_subject and e.kind = p_kind and e.created_at > pg_catalog.now() - v_window
     order by e.created_at
     offset (v_count - p_max)
     limit 1;
    return pg_catalog.jsonb_build_object('ok', false, 'retry_at', v_retry);
  end if;

  insert into private.api_events (subject, kind) values (p_subject, p_kind);
  return pg_catalog.jsonb_build_object('ok', true);
end
$$;

revoke all on function public.demo_rate_take(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.demo_rate_take(text, text, integer, integer) to service_role;
