-- Coaching bill numbers (per arena) + organization pincode for invoices
alter table public.coaching_registrations
  add column if not exists bill_number integer;

with ranked as (
  select id,
    row_number() over (partition by organization_id order by created_at, id) as rn
  from public.coaching_registrations
  where bill_number is null
)
update public.coaching_registrations c
set bill_number = ranked.rn
from ranked
where c.id = ranked.id;

alter table public.coaching_registrations
  alter column bill_number set not null;

create unique index if not exists coaching_registrations_org_bill_uidx
  on public.coaching_registrations (organization_id, bill_number);

alter table public.organizations
  add column if not exists pincode text;
