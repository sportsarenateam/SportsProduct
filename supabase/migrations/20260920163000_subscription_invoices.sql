-- SportzArena SaaS invoices for arena-owner subscription payments (Cashfree).
-- Cashfree does not email a merchant tax invoice; the API issues these.

create sequence if not exists public.subscription_invoice_seq start 1001;

create table if not exists public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_number text not null unique,
  cashfree_order_id text not null unique,
  plan_id text,
  plan_name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'INR',
  period_starts_at timestamptz not null,
  period_ends_at timestamptz not null,
  customer_email text not null,
  customer_name text not null default '',
  arena_name text not null,
  arena_address text not null default '',
  payment_provider text not null default 'cashfree',
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscription_invoices_org_created_idx
  on public.subscription_invoices (organization_id, created_at desc);

alter table public.subscription_invoices enable row level security;

drop policy if exists "owners read subscription invoices" on public.subscription_invoices;
create policy "owners read subscription invoices" on public.subscription_invoices
  for select
  using (private.has_org_role(organization_id, array['owner']::public.app_role[]));

revoke insert, update, delete on public.subscription_invoices from anon, authenticated;
grant select on public.subscription_invoices to authenticated;
grant all on public.subscription_invoices to service_role;
grant usage, select on sequence public.subscription_invoice_seq to service_role;

create or replace function public.next_subscription_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  n := nextval('public.subscription_invoice_seq');
  return 'SA-' || to_char((timezone('Asia/Kolkata', now())), 'YYYY') || '-' || lpad(n::text, 4, '0');
end;
$$;

revoke all on function public.next_subscription_invoice_number() from public, anon, authenticated;
grant execute on function public.next_subscription_invoice_number() to service_role;
