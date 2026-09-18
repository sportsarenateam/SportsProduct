-- Membership validity period (staff Remind via wa.me in Phase 1; Meta WhatsApp deferred)
alter table public.membership_billing
  add column if not exists start_date date,
  add column if not exists end_date date;

create index if not exists membership_billing_org_end_date_idx
  on public.membership_billing (organization_id, end_date);

comment on column public.membership_billing.start_date is 'Membership validity start (inclusive)';
comment on column public.membership_billing.end_date is 'Membership validity end (inclusive); used for expiry reminders';
