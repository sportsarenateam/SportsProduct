create extension if not exists "pgcrypto";
create schema if not exists private;

create type public.app_role as enum ('owner', 'manager', 'cashier');
create type public.booking_source as enum ('walk_in', 'membership', 'turftown', 'playo', 'other_online');
create type public.session_status as enum ('reserved', 'checked_in', 'completed', 'cancelled', 'no_show');
create type public.payment_method as enum ('cash', 'upi', 'gpay', 'card');
create type public.payment_status as enum ('pending', 'partial', 'paid', 'refunded', 'void');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  contact_phone text,
  timezone text not null default 'Asia/Kolkata',
  currency_code text not null default 'INR',
  created_at timestamptz not null default now()
);
create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, address text, created_at timestamptz not null default now()
);
create table public.sports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, default_hourly_rate numeric(12,2) not null check (default_hourly_rate >= 0),
  active boolean not null default true,
  unique (organization_id, name)
);
create table public.courts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  venue_id uuid not null references public.venues(id) on delete cascade,
  sport_id uuid references public.sports(id) on delete set null,
  name text not null, active boolean not null default true,
  unique (venue_id, name)
);
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, phone text, created_at timestamptz not null default now()
);
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  court_id uuid not null references public.courts(id),
  sport_id uuid references public.sports(id),
  customer_id uuid references public.customers(id),
  guest_name text,
  booking_source public.booking_source not null,
  external_reference text,
  status public.session_status not null default 'completed',
  starts_at timestamptz not null, ends_at timestamptz not null,
  hourly_rate numeric(12,2) not null check (hourly_rate >= 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  notes text, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create table public.session_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null,
  status public.payment_status not null default 'paid',
  reference text, received_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id)
);
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null unique references public.sessions(id),
  invoice_number text not null, issued_at timestamptz not null default now(),
  total_amount numeric(12,2) not null, status text not null default 'issued',
  pdf_path text, unique (organization_id, invoice_number)
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null, description text not null,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default current_date,
  payment_method public.payment_method, receipt_path text,
  recorded_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table public.subscription_plans (
  id text primary key, name text not null, monthly_price numeric(12,2) not null,
  razorpay_plan_id text unique, active boolean not null default true
);
create table public.arena_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id text references public.subscription_plans(id),
  status text not null default 'trialing', trial_ends_at timestamptz,
  razorpay_customer_id text unique, razorpay_subscription_id text unique,
  current_period_ends_at timestamptz, updated_at timestamptz not null default now()
);
create table public.razorpay_webhook_events (
  event_id text primary key, payload jsonb not null, processed_at timestamptz not null default now()
);
create table public.activity_log (
  id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id), action text not null, entity_type text not null,
  entity_id uuid, before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);

create index on public.sessions (organization_id, starts_at);
create index on public.session_payments (organization_id, received_at);
create index on public.expenses (organization_id, expense_date);

create or replace function private.has_org_role(target_org uuid, permitted public.app_role[])
returns boolean language sql stable security definer set search_path = public, private as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org and m.user_id = auth.uid()
      and m.active and m.role = any(permitted)
  );
$$;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.venues enable row level security;
alter table public.sports enable row level security;
alter table public.courts enable row level security;
alter table public.customers enable row level security;
alter table public.sessions enable row level security;
alter table public.session_payments enable row level security;
alter table public.invoices enable row level security;
alter table public.expenses enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.arena_subscriptions enable row level security;
alter table public.activity_log enable row level security;

create policy "users read own profile" on public.profiles for select using (id = auth.uid());
create policy "members read organizations" on public.organizations for select using (private.has_org_role(id, array['owner','manager','cashier']::public.app_role[]));
create policy "members read memberships" on public.organization_memberships for select using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy "owners manage memberships" on public.organization_memberships for all using (private.has_org_role(organization_id, array['owner']::public.app_role[]));

create policy "members read venues" on public.venues for select using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy "owners managers change venues" on public.venues for all using (private.has_org_role(organization_id, array['owner','manager']::public.app_role[]));
create policy "members read sports" on public.sports for select using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy "owners managers change sports" on public.sports for all using (private.has_org_role(organization_id, array['owner','manager']::public.app_role[]));
create policy "members read courts" on public.courts for select using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy "owners managers change courts" on public.courts for all using (private.has_org_role(organization_id, array['owner','manager']::public.app_role[]));
create policy "members manage customers" on public.customers for all using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy "members read sessions" on public.sessions for select using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy "staff create sessions" on public.sessions for insert with check (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy "owners managers update sessions" on public.sessions for update using (private.has_org_role(organization_id, array['owner','manager']::public.app_role[]));
create policy "members read payments" on public.session_payments for select using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy "staff create payments" on public.session_payments for insert with check (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy "members read invoices" on public.invoices for select using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
create policy "owners managers manage invoices" on public.invoices for all using (private.has_org_role(organization_id, array['owner','manager']::public.app_role[]));
create policy "owners managers manage expenses" on public.expenses for all using (private.has_org_role(organization_id, array['owner','manager']::public.app_role[]));
create policy "owners read subscription" on public.arena_subscriptions for select using (private.has_org_role(organization_id, array['owner']::public.app_role[]));
create policy "members read subscription plans" on public.subscription_plans for select using (active = true);
create policy "owners managers read audit" on public.activity_log for select using (private.has_org_role(organization_id, array['owner','manager']::public.app_role[]));

insert into public.subscription_plans (id, name, monthly_price) values ('basic', 'Basic', 499), ('premium', 'Premium', 699);
