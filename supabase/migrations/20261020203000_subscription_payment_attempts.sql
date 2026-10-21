-- Keep payment attempts and billing contact details separate from current subscription state.
alter table public.arena_subscriptions
  add column if not exists billing_email text;

alter table public.arena_subscriptions
  drop column if exists razorpay_subscription_id;

update public.arena_subscriptions s
set billing_email = u.email
from public.organization_memberships m
join auth.users u on u.id = m.user_id
where m.organization_id = s.organization_id
  and m.role = 'owner'
  and m.active
  and s.billing_email is null
  and u.email is not null;

create table if not exists public.subscription_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cashfree_order_id text not null unique,
  plan_id text references public.subscription_plans(id),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'INR',
  customer_email text,
  order_status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists subscription_payment_attempts_org_created_idx
  on public.subscription_payment_attempts (organization_id, created_at desc);

alter table public.subscription_payment_attempts enable row level security;

drop policy if exists "owners read subscription payment attempts" on public.subscription_payment_attempts;
create policy "owners read subscription payment attempts" on public.subscription_payment_attempts
  for select
  using (private.has_org_role(organization_id, array['owner']::public.app_role[]));

revoke insert, update, delete on public.subscription_payment_attempts from anon, authenticated;
grant select on public.subscription_payment_attempts to authenticated;
grant all on public.subscription_payment_attempts to service_role;

-- Preserve existing order IDs when the legacy checkout column is still present.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'arena_subscriptions'
      and column_name = 'cashfree_order_id'
  ) then
    execute $migration$
      insert into public.subscription_payment_attempts (
        organization_id,
        cashfree_order_id,
        plan_id,
        amount,
        customer_email,
        order_status,
        created_at,
        updated_at
      )
      select
        s.organization_id,
        s.cashfree_order_id,
        s.plan_id,
        greatest(coalesce(p.monthly_price, 499), 0.01),
        s.billing_email,
        'LEGACY_IMPORTED',
        s.updated_at,
        s.updated_at
      from public.arena_subscriptions s
      left join public.subscription_plans p on p.id = s.plan_id
      where s.cashfree_order_id is not null
      on conflict (cashfree_order_id) do nothing
    $migration$;

    drop index if exists public.arena_subscriptions_cashfree_order_idx;
    alter table public.arena_subscriptions drop column cashfree_order_id;
  end if;
end
$$;

notify pgrst, 'reload schema';
