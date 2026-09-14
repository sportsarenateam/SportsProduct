-- Saved "Generate Invoice" drafts so owners/staff can reopen (eye), remove, and WhatsApp again.
create table if not exists public.generated_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bill_number integer not null,
  customer_name text not null,
  customer_mobile text not null default '',
  grand_total numeric(12,2) not null check (grand_total >= 0),
  payload jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists generated_invoices_org_created_idx
  on public.generated_invoices (organization_id, created_at desc);

alter table public.generated_invoices enable row level security;

drop policy if exists "members read generated invoices" on public.generated_invoices;
create policy "members read generated invoices" on public.generated_invoices
  for select using (
    exists (
      select 1 from public.organization_memberships m
      where m.organization_id = generated_invoices.organization_id
        and m.user_id = auth.uid()
        and m.active = true
    )
  );

revoke insert, update, delete on public.generated_invoices from anon, authenticated;
grant select on public.generated_invoices to authenticated;
grant all on public.generated_invoices to service_role;
