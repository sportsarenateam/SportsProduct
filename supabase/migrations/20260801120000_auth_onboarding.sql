create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

create or replace function private.complete_owner_onboarding(
  p_arena_name text,
  p_address text,
  p_contact_phone text,
  p_timezone text default 'Asia/Kolkata',
  p_currency_code text default 'INR'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_organization public.organizations;
  v_trial_ends_at timestamptz := now() + interval '30 days';
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if char_length(trim(p_arena_name)) < 2 or char_length(trim(p_arena_name)) > 120 then
    raise exception 'Arena name must be between 2 and 120 characters';
  end if;
  if exists (
    select 1 from public.organization_memberships
    where user_id = v_user_id and active
  ) then
    raise exception 'This account already belongs to an arena';
  end if;

  insert into public.organizations (name, address, contact_phone, timezone, currency_code)
  values (trim(p_arena_name), nullif(trim(p_address), ''), nullif(trim(p_contact_phone), ''),
    coalesce(nullif(trim(p_timezone), ''), 'Asia/Kolkata'),
    coalesce(nullif(trim(p_currency_code), ''), 'INR'))
  returning * into v_organization;

  insert into public.organization_memberships (organization_id, user_id, role)
  values (v_organization.id, v_user_id, 'owner');

  insert into public.arena_subscriptions (organization_id, status, trial_ends_at)
  values (v_organization.id, 'trialing', v_trial_ends_at);

  insert into public.activity_log (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (v_organization.id, v_user_id, 'created', 'organization', v_organization.id, to_jsonb(v_organization));

  return jsonb_build_object(
    'organization_id', v_organization.id,
    'organization_name', v_organization.name,
    'trial_ends_at', v_trial_ends_at
  );
end;
$$;

create or replace function public.complete_owner_onboarding(
  p_arena_name text,
  p_address text,
  p_contact_phone text,
  p_timezone text default 'Asia/Kolkata',
  p_currency_code text default 'INR'
)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select private.complete_owner_onboarding(
    p_arena_name, p_address, p_contact_phone, p_timezone, p_currency_code
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.complete_owner_onboarding(text, text, text, text, text) to authenticated;
grant execute on function public.complete_owner_onboarding(text, text, text, text, text) to authenticated;

create policy "users update own profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "owners manage memberships" on public.organization_memberships;
