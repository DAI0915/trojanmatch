-- TrojanMatch 0006 — demo reset clears Space-creation rate limits for the
-- sandbox's synthetic personas ONLY (so rehearsals can't exhaust the presenter's
-- create_space limit before the pitch).
--
-- Scope of this migration (deliberately narrow):
--   * ONE new function; no existing function, table, policy or data is changed.
--   * Deletes only private.api_events rows with kind = 'create_space' whose
--     subject is a persona registered in private.demo_personas for THIS slot AND
--     whose profile is synthetic AND in this slot's demo scope.
--     - Production users can never match: demo_register_personas() rejects
--       non-synthetic or out-of-scope profiles, and the scope join re-checks it.
--     - Other demo slots never match (slot + scope filter).
--     - Other limit kinds (e.g. join_code_failed, demo_start_failed) are kept.
--   * EXECUTE: service_role only (called by /api/demo/reset and /api/demo/start
--     after the presenter lease / presenter code has been verified).

create function public.demo_clear_create_limits(p_slot integer)
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
     and e.kind = 'create_space';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

revoke all on function public.demo_clear_create_limits(integer) from public, anon, authenticated;
grant execute on function public.demo_clear_create_limits(integer) to service_role;
