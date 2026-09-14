-- Multi-tenant POS / ops tables adapted from CTC My_APP for SportzArena.

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null check (category in ('EQUIPMENT', 'BEVERAGE')),
  price numeric(12,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.pos_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bill_number integer not null,
  customer_name text not null default '',
  customer_mobile text not null default '',
  sport_id uuid references public.sports(id) on delete set null,
  sport_name text,
  booking_date date,
  start_time text,
  end_time text,
  duration_hours numeric(8,2) not null default 0,
  booking_amount numeric(12,2) not null default 0,
  items_total numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  advance numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  payment_mode text not null check (payment_mode in ('CASH', 'ONLINE', 'SPLIT')),
  split_cash numeric(12,2) not null default 0,
  split_online numeric(12,2) not null default 0,
  booking_method text not null default 'WALK_IN',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, bill_number)
);

create table if not exists public.pos_transaction_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null references public.pos_transactions(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  price_at_sale numeric(12,2) not null check (price_at_sale >= 0),
  category text not null default 'EQUIPMENT'
);

create table if not exists public.pos_transaction_courts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_id uuid not null references public.pos_transactions(id) on delete cascade,
  court_id uuid references public.courts(id) on delete set null,
  court_name text not null
);

create table if not exists public.coaching_registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_name text not null,
  child_name text not null,
  age integer not null default 0,
  mobile_number text not null default '',
  level text not null default 'Beginner',
  court_number text not null default '',
  start_time text not null default '',
  end_time text not null default '',
  start_date date,
  end_date date,
  amount numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  advance numeric(12,2) not null default 0,
  payment_mode text not null default 'CASH',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.membership_billing (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bill_number integer not null,
  customer_name text not null default '',
  customer_mobile text not null default '',
  sport_name text not null default '',
  timing text not null default '',
  booking_method text not null default 'WALK_IN',
  amount numeric(12,2) not null default 0,
  payment_mode text not null default 'CASH',
  items jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, bill_number)
);

create index if not exists inventory_items_org_idx on public.inventory_items (organization_id);
create index if not exists pos_transactions_org_created_idx on public.pos_transactions (organization_id, created_at desc);
create index if not exists coaching_registrations_org_idx on public.coaching_registrations (organization_id, created_at desc);
create index if not exists membership_billing_org_idx on public.membership_billing (organization_id, created_at desc);

alter table public.inventory_items enable row level security;
alter table public.pos_transactions enable row level security;
alter table public.pos_transaction_items enable row level security;
alter table public.pos_transaction_courts enable row level security;
alter table public.coaching_registrations enable row level security;
alter table public.membership_billing enable row level security;

-- Members can read; writes go through service_role API.
do $$ begin
  create policy "members read inventory" on public.inventory_items for select
    using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members read pos transactions" on public.pos_transactions for select
    using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members read pos items" on public.pos_transaction_items for select
    using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members read pos courts" on public.pos_transaction_courts for select
    using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members read coaching" on public.coaching_registrations for select
    using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "members read membership billing" on public.membership_billing for select
    using (private.has_org_role(organization_id, array['owner','manager','cashier']::public.app_role[]));
exception when duplicate_object then null; end $$;

revoke insert, update, delete on public.inventory_items from anon, authenticated;
revoke insert, update, delete on public.pos_transactions from anon, authenticated;
revoke insert, update, delete on public.pos_transaction_items from anon, authenticated;
revoke insert, update, delete on public.pos_transaction_courts from anon, authenticated;
revoke insert, update, delete on public.coaching_registrations from anon, authenticated;
revoke insert, update, delete on public.membership_billing from anon, authenticated;
