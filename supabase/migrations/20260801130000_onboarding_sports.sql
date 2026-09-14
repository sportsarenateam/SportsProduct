create or replace function private.save_owner_onboarding_sports(p_sport_names text[])
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_organization_id uuid;
  v_name text;
  v_rate numeric;
  v_saved text[] := array[]::text[];
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if coalesce(array_length(p_sport_names, 1), 0) = 0 then raise exception 'Select at least one sport'; end if;
  select organization_id into v_organization_id from public.organization_memberships
    where user_id = auth.uid() and role = 'owner' and active limit 1;
  if v_organization_id is null then raise exception 'Owner arena was not found'; end if;

  foreach v_name in array p_sport_names loop
    v_rate := case v_name
      when 'Cricket Turf' then 1500 when 'Badminton' then 500 when 'Football' then 1200
      when 'Pickleball' then 350 when 'Table Tennis' then 300 when 'Carrom' then 150
      when 'Zumba Class' then 250 when 'Tennis' then 600 else null end;
    if v_rate is null then raise exception 'Unsupported sport: %', v_name; end if;
    insert into public.sports (organization_id, name, default_hourly_rate)
    values (v_organization_id, v_name, v_rate)
    on conflict (organization_id, name) do update set active = true;
    v_saved := array_append(v_saved, v_name);
  end loop;
  return jsonb_build_object('organization_id', v_organization_id, 'sports', v_saved);
end;
$$;

create or replace function public.save_owner_onboarding_sports(p_sport_names text[])
returns jsonb
language sql
security invoker
set search_path = public, private
as $$ select private.save_owner_onboarding_sports(p_sport_names); $$;

grant execute on function private.save_owner_onboarding_sports(text[]) to authenticated;
grant execute on function public.save_owner_onboarding_sports(text[]) to authenticated;
