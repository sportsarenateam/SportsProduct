-- Align Data API RLS with product roles: Sales / POS history is owner-only;
-- invoice mutations are owner-only (staff still read via select policies).

drop policy if exists "members read pos transactions" on public.pos_transactions;
create policy "owners read pos transactions" on public.pos_transactions
  for select
  using (private.has_org_role(organization_id, array['owner']::public.app_role[]));

drop policy if exists "members read pos items" on public.pos_transaction_items;
create policy "owners read pos items" on public.pos_transaction_items
  for select
  using (
    exists (
      select 1
      from public.pos_transactions t
      where t.id = transaction_id
        and private.has_org_role(t.organization_id, array['owner']::public.app_role[])
    )
  );

drop policy if exists "members read pos courts" on public.pos_transaction_courts;
create policy "owners read pos courts" on public.pos_transaction_courts
  for select
  using (
    exists (
      select 1
      from public.pos_transactions t
      where t.id = transaction_id
        and private.has_org_role(t.organization_id, array['owner']::public.app_role[])
    )
  );

drop policy if exists "owners managers manage invoices" on public.invoices;
create policy "owners manage invoices" on public.invoices
  for all
  using (private.has_org_role(organization_id, array['owner']::public.app_role[]))
  with check (private.has_org_role(organization_id, array['owner']::public.app_role[]));
