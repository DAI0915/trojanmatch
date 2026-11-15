select
  (select count(*) from public.teams t join public.matching_spaces s on s.id = t.space_id where s.scope = 'prod') as prod_teams,
  (select count(*) from public.team_members m join public.matching_spaces s on s.id = m.space_id where s.scope = 'prod') as prod_team_members,
  (select md5(coalesce(string_agg(t.id::text || t.name || t.status::text || t.target_size || t.requirements::text, '|' order by t.id), '')) from public.teams t join public.matching_spaces s on s.id = t.space_id where s.scope = 'prod') as prod_teams_digest;
