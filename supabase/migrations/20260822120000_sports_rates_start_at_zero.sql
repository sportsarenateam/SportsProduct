-- New sports start at ₹0/hr until the owner sets a rate.
-- Reactivating a sport must not overwrite a custom rate with canned defaults.
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
    if v_name not in (
      'Cricket Turf', 'Badminton', 'Football', 'Pickleball',
      'Table Tennis', 'Carrom', 'Zumba Class', 'Tennis'
    ) then
      raise exception 'Unsupported sport';
    end if;
    insert into public.sports (organization_id, name, default_hourly_rate, active)
    values (v_organization_id, v_name, 0, true)
    on conflict (organization_id, name) do update
      set active = true;
    -- intentionally do not update default_hourly_rate on conflict
    v_saved := array_append(v_saved, v_name);
  end loop;
  return v_saved;
end;
$$;
