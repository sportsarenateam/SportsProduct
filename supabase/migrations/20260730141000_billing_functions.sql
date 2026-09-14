alter table public.razorpay_webhook_events add column if not exists event_type text not null default 'unknown';

create or replace function public.create_arena_session(
  p_organization_id uuid, p_venue_id uuid, p_court_id uuid, p_sport_id uuid,
  p_customer_name text, p_booking_source public.booking_source, p_starts_at timestamptz,
  p_ends_at timestamptz, p_hourly_rate numeric, p_total numeric, p_payment_method public.payment_method,
  p_payment_amount numeric, p_notes text, p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  new_session public.sessions;
  next_number integer;
  invoice_no text;
begin
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = p_actor_id and active
  ) then raise exception 'Not authorized'; end if;

  insert into public.sessions (
    organization_id, court_id, sport_id, guest_name, booking_source, starts_at, ends_at,
    hourly_rate, total_amount, notes, created_by
  ) values (
    p_organization_id, p_court_id, p_sport_id, p_customer_name, p_booking_source, p_starts_at,
    p_ends_at, p_hourly_rate, p_total, p_notes, p_actor_id
  ) returning * into new_session;

  if p_payment_amount > 0 then
    insert into public.session_payments (organization_id, session_id, amount, method, status, recorded_by)
    values (p_organization_id, new_session.id, p_payment_amount, p_payment_method,
      case when p_payment_amount < p_total then 'partial' else 'paid' end, p_actor_id);
  end if;

  select count(*) + 1000 into next_number from public.invoices where organization_id = p_organization_id;
  invoice_no := 'INV-' || next_number::text;
  insert into public.invoices (organization_id, session_id, invoice_number, total_amount)
  values (p_organization_id, new_session.id, invoice_no, p_total);
  insert into public.activity_log (organization_id, actor_id, action, entity_type, entity_id, after_data)
  values (p_organization_id, p_actor_id, 'created', 'session', new_session.id, to_jsonb(new_session));
  return jsonb_build_object('session', to_jsonb(new_session), 'invoiceNumber', invoice_no);
end;
$$;

create or replace function public.dashboard_summary(p_organization_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language sql security definer set search_path = public as $$
  with sessions_in_period as (
    select * from public.sessions where organization_id = p_organization_id and status = 'completed'
      and (p_from is null or starts_at >= p_from) and (p_to is null or starts_at <= p_to)
  ), revenue as (
    select coalesce(sum(total_amount), 0) amount, count(*) sessions from sessions_in_period
  ), payments as (
    select coalesce(sum(p.amount), 0) amount from public.session_payments p
    join sessions_in_period s on s.id = p.session_id where p.status in ('paid', 'partial')
  ), costs as (
    select coalesce(sum(amount), 0) amount from public.expenses where organization_id = p_organization_id
      and (p_from is null or expense_date >= p_from::date) and (p_to is null or expense_date <= p_to::date)
  )
  select jsonb_build_object('revenue', revenue.amount, 'expenses', costs.amount,
    'outstanding', greatest(revenue.amount - payments.amount, 0), 'completedSessions', revenue.sessions)
  from revenue, payments, costs;
$$;

revoke all on function public.create_arena_session from public;
revoke all on function public.dashboard_summary from public;
grant execute on function public.create_arena_session to service_role;
grant execute on function public.dashboard_summary to service_role;
