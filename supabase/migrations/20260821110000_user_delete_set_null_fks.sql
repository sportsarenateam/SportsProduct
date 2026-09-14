-- Allow deleting auth users without FK blocks from audit/ops columns.
-- Keep history rows; clear the user reference instead of cascading deletes.

alter table public.activity_log
  drop constraint if exists activity_log_actor_id_fkey;
alter table public.activity_log
  add constraint activity_log_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete set null;

alter table public.sessions
  drop constraint if exists sessions_created_by_fkey;
alter table public.sessions
  add constraint sessions_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.session_payments
  drop constraint if exists session_payments_recorded_by_fkey;
alter table public.session_payments
  add constraint session_payments_recorded_by_fkey
  foreign key (recorded_by) references auth.users(id) on delete set null;

alter table public.expenses
  drop constraint if exists expenses_recorded_by_fkey;
alter table public.expenses
  add constraint expenses_recorded_by_fkey
  foreign key (recorded_by) references auth.users(id) on delete set null;

alter table public.pos_transactions
  drop constraint if exists pos_transactions_created_by_fkey;
alter table public.pos_transactions
  add constraint pos_transactions_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.coaching_registrations
  drop constraint if exists coaching_registrations_created_by_fkey;
alter table public.coaching_registrations
  add constraint coaching_registrations_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table public.membership_billing
  drop constraint if exists membership_billing_created_by_fkey;
alter table public.membership_billing
  add constraint membership_billing_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
