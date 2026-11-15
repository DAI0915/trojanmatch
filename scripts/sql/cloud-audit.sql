with own as (
  select p.oid, n.nspname||'.'||p.proname as name, p.prosecdef, p.proconfig, p.proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private')
    and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and p.prorettype <> 'event_trigger'::regtype
)
select 'definer_without_search_path' as check_name,
       coalesce(string_agg(name, ','), '') as violations
  from own where prosecdef and not coalesce(proconfig,'{}') @> array['search_path=""']
union all
select 'public_execute_or_null_acl', coalesce(string_agg(name, ','), '')
  from own where proacl is null or exists (select 1 from aclexplode(proacl) a where a.grantee = 0)
union all
select 'anon_executable_NOT_in_allowlist', coalesce(string_agg(name, ','), '')
  from own where has_function_privilege('anon', oid, 'EXECUTE')
   and name not in ('public.get_space','public.search_spaces')
union all
select 'authenticated_executable_NOT_in_allowlist', coalesce(string_agg(name, ','), '')
  from own where has_function_privilege('authenticated', oid, 'EXECUTE')
   and name not in ('private.can_recruit','private.current_scope','private.is_active_member','private.is_participant',
                    'private.participation_visible','private.profile_visible','private.team_is_active','private.team_visible','private.valid_hours',
                    'public.check_space_duplicates','public.create_space','public.create_team','public.update_team','public.demo_lease_valid','public.get_invite_link','public.get_match_pool','public.get_space','public.join_space','public.search_spaces')
union all
select 'tables_without_rls', coalesce(string_agg(n.nspname||'.'||c.relname, ','), '')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public','private') and c.relkind = 'r' and not c.relrowsecurity
union all
select 'client_write_privs_on_rpc_only_tables', coalesce(string_agg(r.role||':'||p.priv||':'||t.t, ','), '')
  from (values ('anon'),('authenticated')) r(role),
       (values ('matching_spaces'),('space_hackathon_details'),('space_course_details'),('space_secrets'),
               ('teams'),('team_members'),('invitations'),('match_runs')) t(t),
       (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE')) p(priv)
 where has_table_privilege(r.role, 'public.'||t.t, p.priv)
union all
select 'client_select_on_secrets_or_private', coalesce(string_agg(r.role||':'||t.t, ','), '')
  from (values ('anon'),('authenticated')) r(role),
       (values ('public.space_secrets'),('private.app_config'),('private.api_events'),('private.demo_slots')) t(t)
 where has_table_privilege(r.role, t.t, 'SELECT')
union all
select 'postgres_default_acls_granting_clients', coalesce(string_agg(n.nspname||':'||d.defaclobjtype::text, ','), '')
  from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
 where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname in ('public','private')
   and (d.defaclacl::text ~ '(^|[{,])anon=' or d.defaclacl::text ~ '(^|[{,])authenticated=')
union all
select 'updatable_protected_columns', coalesce(string_agg(x, ','), '')
  from (select 'profiles.'||c as x from unnest(array['scope','is_synthetic','id']) c
         where has_column_privilege('authenticated','public.profiles',c,'UPDATE')
        union all
        select 'participations.'||c from unnest(array['space_id','user_id']) c
         where has_column_privilege('authenticated','public.participations',c,'UPDATE')
        union all
        select 'course.instructions_url:'||r from unnest(array['anon','authenticated']) r
         where has_column_privilege(r,'public.space_course_details','instructions_url','SELECT')) s
union all
select 'MISSING_auth_triggers', coalesce(string_agg(t, ','), '')
  from unnest(array['on_auth_user_created','on_auth_user_app_metadata_changed']) t
 where not exists (select 1 from pg_trigger g where g.tgrelid = 'auth.users'::regclass and g.tgname = t)
union all
select 'MISSING_per_scope_url_index', case when exists (select 1 from pg_indexes where indexname = 'space_hackathon_details_scope_url_year_uq'
        and indexdef like '%(scope, official_url_normalized, edition_year)%') then '' else 'missing' end
union all
select 'demo_admin_fns_NOT_service_role_only', coalesce(string_agg(p.proname, ','), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'demo\_%' and p.proname <> 'demo_lease_valid'
   and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE'))
union all
select 'INFO_demo_admin_fn_count', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'demo\_%' and p.proname <> 'demo_lease_valid')
union all
select 'client_select_on_demo_personas', case when has_table_privilege('anon','private.demo_personas','SELECT') or has_table_privilege('authenticated','private.demo_personas','SELECT') then 'EXPOSED' else '' end
union all
select 'INFO_authenticated_executable_count', (select count(*)::text from own where has_function_privilege('authenticated', oid, 'EXECUTE'))
union all
select 'INFO_server_version', current_setting('server_version');
