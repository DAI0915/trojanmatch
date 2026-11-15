select count(*) as prod_user_limit_events,
       md5(coalesce(string_agg(e.subject || '|' || e.kind || '|' || e.created_at::text, ';' order by e.id), '')) as prod_user_limit_digest
from private.api_events e
where e.subject in (select p.id::text from public.profiles p where p.scope = 'prod');
