-- Browser clients may read their own profile, but profile creation is owned by
-- the auth.users trigger declared in the preceding migration.
revoke insert on table public.profiles from anon, authenticated;
alter function private.handle_new_user() set search_path = public, pg_temp;
alter function private.has_org_role(uuid, public.app_role[]) set search_path = public, private, pg_temp;

-- Memberships are an authorization boundary.  Owners may read their team, but
-- cannot create, deactivate, or promote memberships through the Data API.
drop policy if exists "owners manage memberships" on public.organization_memberships;
revoke insert, update, delete on table public.organization_memberships from anon, authenticated;
revoke insert, update, delete on table public.organizations from anon, authenticated;
revoke insert, update, delete on table public.arena_subscriptions from anon, authenticated;

-- The old onboarding RPC was callable by any authenticated browser session.
-- Provisioning is now initiated only by the API after it has validated a JWT.
drop function if exists public.complete_owner_onboarding(text, text, text, text, text);
drop function if exists public.save_owner_onboarding_sports(text[]);
revoke usage on schema private from authenticated;
revoke all on function private.complete_owner_onboarding(text, text, text, text, text) from public;
revoke all on function private.save_owner_onboarding_sports(text[]) from public;

-- This legacy helper may exist on projects that enabled automatic RLS setup.
-- It must never be callable through the public Data API.
revoke all on function public.rls_auto_enable() from public;

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
  if p_actor_id is null then
    raise exception 'Actor is required';
  end if;
  if char_length(trim(coalesce(p_arena_name, ''))) not between 2 and 120 then
    raise exception 'Arena name must be between 2 and 120 characters';
  end if;
  if char_length(coalesce(p_address, '')) > 500 or char_length(coalesce(p_contact_phone, '')) > 40 then
    raise exception 'Arena contact details are too long';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency code must be a three-letter ISO code';
  end if;
  if not exists (select 1 from pg_timezone_names where name = v_timezone) then
    raise exception 'Unsupported timezone';
  end if;

  -- Serialize retries and concurrent browser submissions for one account.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 0));

  select o.* into v_organization
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = p_actor_id and m.active
  order by m.created_at
  limit 1;

  if found then
    select * into v_subscription
    from public.arena_subscriptions
    where organization_id = v_organization.id;
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

-- This wrapper is intentionally invoker-security and granted only to
-- service_role.  The browser cannot call it; Express supplies the JWT-verified
-- actor ID rather than accepting a user-controlled authorization claim.
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
  if v_organization_id is null then
    raise exception 'Owner arena was not found';
  end if;

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
as $$ select private.save_owner_onboarding_sports(p_actor_id, p_sport_names); $$;
revoke all on function public.save_owner_onboarding_sports(uuid, text[]) from public, anon, authenticated;
grant execute on function private.save_owner_onboarding_sports(uuid, text[]) to service_role;
grant execute on function public.save_owner_onboarding_sports(uuid, text[]) to service_role;

create or replace function private.organization_has_active_entitlement(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.arena_subscriptions s
    where s.organization_id = p_organization_id
      and (
        (s.status = 'trialing' and s.trial_ends_at > now())
        or (s.status in ('active', 'authenticated') and (s.current_period_ends_at is null or s.current_period_ends_at > now()))
      )
  );
$$;
revoke all on function private.organization_has_active_entitlement(uuid) from public, anon, authenticated;
grant execute on function private.organization_has_active_entitlement(uuid) to service_role;

-- Only safe pricing fields are available without organization membership.
create or replace view public.subscription_plan_catalog
with (security_invoker = true)
as
  select id, name, monthly_price
  from public.subscription_plans
  where active;

drop policy if exists "public read active subscription plans" on public.subscription_plans;
create policy "public read active subscription plans"
on public.subscription_plans
for select to anon, authenticated
using (active);

revoke all on table public.subscription_plans from anon, authenticated;
grant select (id, name, monthly_price) on table public.subscription_plans to anon, authenticated;
grant select on table public.subscription_plan_catalog to anon, authenticated;

-- Privileged routines must not live in the exposed public schema.
alter function public.create_arena_session(uuid, uuid, uuid, uuid, text, public.booking_source, timestamptz, timestamptz, numeric, numeric, public.payment_method, numeric, text, uuid)
  set schema private;
alter function public.dashboard_summary(uuid, timestamptz, timestamptz)
  set schema private;
revoke all on function private.create_arena_session(uuid, uuid, uuid, uuid, text, public.booking_source, timestamptz, timestamptz, numeric, numeric, public.payment_method, numeric, text, uuid) from public, anon, authenticated;
revoke all on function private.dashboard_summary(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function private.create_arena_session(uuid, uuid, uuid, uuid, text, public.booking_source, timestamptz, timestamptz, numeric, numeric, public.payment_method, numeric, text, uuid) to service_role;
grant execute on function private.dashboard_summary(uuid, timestamptz, timestamptz) to service_role;
