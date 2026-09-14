-- Applied to remote as provision_owner_arena_api.
-- Ensures API service_role can provision arenas and sports after signup.

revoke insert on table public.profiles from anon, authenticated;
revoke insert, update, delete on table public.organization_memberships from anon, authenticated;
revoke insert, update, delete on table public.organizations from anon, authenticated;
revoke insert, update, delete on table public.arena_subscriptions from anon, authenticated;

drop policy if exists "owners manage memberships" on public.organization_memberships;

drop function if exists public.complete_owner_onboarding(text, text, text, text, text);
drop function if exists public.save_owner_onboarding_sports(text[]);
drop function if exists private.save_owner_onboarding_sports(text[]);
revoke usage on schema private from authenticated;

create or replace function private.provision_owner_arena(
  p_actor_id uuid,
  p_arena_name text,
  p_address text,
  p_contact_phone text,
  p_timezone text default 'Asia/Kolkata',
  p_currency_code text default 'INR'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_organization public.organizations;
  v_subscription public.arena_subscriptions;
  v_timezone text := coalesce(nullif(trim(p_timezone), ''), 'Asia/Kolkata');
  v_currency text := upper(coalesce(nullif(trim(p_currency_code), ''), 'INR'));
begin
  if p_actor_id is null then raise exception 'Actor is required'; end if;
  if char_length(trim(coalesce(p_arena_name, ''))) not between 2 and 120 then
    raise exception 'Arena name must be between 2 and 120 characters';
  end if;
  if char_length(coalesce(p_address, '')) > 500 or char_length(coalesce(p_contact_phone, '')) > 40 then
    raise exception 'Arena contact details are too long';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Currency code must be a three-letter ISO code'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 0));

  select o.* into v_organization
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = p_actor_id and m.active
  order by m.created_at
  limit 1;

  if found then
    select * into v_subscription from public.arena_subscriptions where organization_id = v_organization.id;
    return jsonb_build_object(
      'organization', jsonb_build_object('id', v_organization.id, 'name', v_organization.name),
      'subscription', jsonb_build_object(
        'status', coalesce(v_subscription.status, 'trialing'),
        'trialEndsAt', v_subscription.trial_ends_at,
        'currentPeriodEndsAt', v_subscription.current_period_ends_at
      ),
      'alreadyProvisioned', true
    );
  end if;

  insert into public.organizations (name, address, contact_phone, timezone, currency_code)
  values (
    trim(p_arena_name),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_contact_phone, '')), ''),
    v_timezone,
    v_currency
  )
  returning * into v_organization;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_organization.id, p_actor_id, 'owner');

  insert into public.arena_subscriptions (organization_id, status, trial_ends_at)
  values (v_organization.id, 'trialing', now() + interval '30 days')
  returning * into v_subscription;

  insert into public.activity_log (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (v_organization.id, p_actor_id, 'created', 'organization', v_organization.id, to_jsonb(v_organization));

  return jsonb_build_object(
    'organization', jsonb_build_object('id', v_organization.id, 'name', v_organization.name),
    'subscription', jsonb_build_object(
      'status', v_subscription.status,
      'trialEndsAt', v_subscription.trial_ends_at,
      'currentPeriodEndsAt', v_subscription.current_period_ends_at
    ),
    'alreadyProvisioned', false
  );
end;
$$;

create or replace function public.provision_owner_arena(
  p_actor_id uuid,
  p_arena_name text,
  p_address text,
  p_contact_phone text,
  p_timezone text default 'Asia/Kolkata',
  p_currency_code text default 'INR'
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.provision_owner_arena(
    p_actor_id, p_arena_name, p_address, p_contact_phone, p_timezone, p_currency_code
  );
$$;

revoke all on function public.provision_owner_arena(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function private.provision_owner_arena(uuid, text, text, text, text, text) to service_role;
grant execute on function public.provision_owner_arena(uuid, text, text, text, text, text) to service_role;

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

  foreach v_name in array p_sport_names loop
    v_rate := case v_name
      when 'Cricket Turf' then 1500 when 'Badminton' then 500 when 'Football' then 1200
      when 'Pickleball' then 350 when 'Table Tennis' then 300 when 'Carrom' then 150
      when 'Zumba Class' then 250 when 'Tennis' then 600 else null end;
    if v_rate is null then raise exception 'Unsupported sport'; end if;
    insert into public.sports (organization_id, name, default_hourly_rate)
    values (v_organization_id, v_name, v_rate)
    on conflict (organization_id, name) do update set active = true;
    v_saved := array_append(v_saved, v_name);
  end loop;
  return v_saved;
end;
$$;

create or replace function public.save_owner_onboarding_sports(p_actor_id uuid, p_sport_names text[])
returns text[]
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.save_owner_onboarding_sports(p_actor_id, p_sport_names);
$$;

revoke all on function public.save_owner_onboarding_sports(uuid, text[]) from public, anon, authenticated;
grant execute on function private.save_owner_onboarding_sports(uuid, text[]) to service_role;
grant execute on function public.save_owner_onboarding_sports(uuid, text[]) to service_role;
