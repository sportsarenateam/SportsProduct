-- Keep only selected sports active per arena
create or replace function private.save_owner_onboarding_sports(
  p_actor_id uuid,
  p_sport_names text[]
)
returns text[]
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_organization_id uuid;
  v_name text;
  v_rate numeric;
  v_saved text[] := array[]::text[];
begin
  if p_actor_id is null or coalesce(array_length(p_sport_names, 1), 0) = 0 then
    raise exception 'An owner and at least one sport are required';
  end if;
  select organization_id into v_organization_id
  from public.organization_memberships
  where user_id = p_actor_id and role = 'owner' and active
  order by created_at
  limit 1;
  if v_organization_id is null then raise exception 'Owner arena was not found'; end if;

  update public.sports
  set active = false
  where organization_id = v_organization_id
    and not (name = any (p_sport_names));

  foreach v_name in array p_sport_names loop
    v_rate := case v_name
      when 'Cricket Turf' then 1500 when 'Badminton' then 500 when 'Football' then 1200
      when 'Pickleball' then 350 when 'Table Tennis' then 300 when 'Carrom' then 150
      when 'Zumba Class' then 250 when 'Tennis' then 600 else null end;
    if v_rate is null then raise exception 'Unsupported sport'; end if;
    insert into public.sports (organization_id, name, default_hourly_rate, active)
    values (v_organization_id, v_name, v_rate, true)
    on conflict (organization_id, name) do update
      set active = true, default_hourly_rate = excluded.default_hourly_rate;
    v_saved := array_append(v_saved, v_name);
  end loop;
  return v_saved;
end;
$$;
