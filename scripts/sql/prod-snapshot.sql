select
  (select count(*) from public.matching_spaces where scope = 'prod') as prod_spaces,
  (select count(*) from public.participations pa join public.matching_spaces s on s.id = pa.space_id where s.scope = 'prod') as prod_participations,
  (select count(*) from public.profiles where scope = 'prod') as prod_profiles,
  (select count(*) from public.teams t join public.matching_spaces s on s.id = t.space_id where s.scope = 'prod') as prod_teams,
  (select md5(string_agg(s.id::text || s.title || s.slug || s.status::text, '|' order by s.id)) from public.matching_spaces s where s.scope = 'prod') as prod_spaces_digest,
  (select md5(string_agg(pa.space_id::text || pa.user_id::text || coalesce(pa.goal,'') || pa.visible_to_members::text || array_to_string(pa.desired_roles, ','), '|' order by pa.space_id, pa.user_id)) from public.participations pa join public.matching_spaces s on s.id = pa.space_id where s.scope = 'prod') as prod_participations_digest,
  (select md5(string_agg(p.id::text || p.display_name || coalesce(p.university,'') || array_to_string(p.skills, ','), '|' order by p.id)) from public.profiles p where p.scope = 'prod') as prod_profiles_digest;
