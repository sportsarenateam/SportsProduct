-- =============================================================================
-- SportzArena PRODUCTION FULL RESET (fresh start for payment testing)
-- =============================================================================
-- WARNING: This permanently deletes ALL arenas, staff, bookings, invoices,
--          subscriptions, and related business data.
--
-- KEEPS: public.subscription_plans (Basic ₹499 / Premium)
--
-- Run in: Supabase Dashboard → SQL Editor (production project)
-- Do NOT run on a DB you still need without a backup.
-- =============================================================================

begin;

-- Child / transactional tables first
truncate table
  public.pos_transaction_items,
  public.pos_transaction_courts,
  public.pos_transactions,
  public.session_payments,
  public.invoices,
  public.sessions,
  public.generated_invoices,
  public.coaching_registrations,
  public.membership_billing,
  public.expenses,
  public.activity_log,
  public.razorpay_webhook_events,
  public.inventory_items,
  public.customers,
  public.courts,
  public.sports,
  public.venues,
  public.arena_subscriptions,
  public.organization_memberships,
  public.organizations,
  public.profiles
restart identity cascade;

-- Keep catalog plans (seed again if somehow empty)
insert into public.subscription_plans (id, name, monthly_price, active)
values
  ('basic', 'Basic', 499, true),
  ('premium', 'Premium', 699, false)
on conflict (id) do update
set
  name = excluded.name,
  monthly_price = excluded.monthly_price,
  active = excluded.active;

commit;

-- =============================================================================
-- OPTIONAL: also wipe Auth users (logins / OTP accounts)
-- Uncomment ONLY if you want every email to be able to sign up again from zero.
-- After this, everyone must Start Free Trial / OTP again.
-- =============================================================================
--
-- delete from auth.sessions;
-- delete from auth.refresh_tokens;
-- delete from auth.mfa_factors;
-- delete from auth.identities;
-- delete from auth.users;
--
-- =============================================================================
-- After cleanup checklist
-- 1) Sign out all browsers / apps
-- 2) Start Free Trial with a fresh email (or same email if auth.users deleted)
-- 3) Complete OTP → password → arena setup
-- 4) Test Cashfree payment in sandbox/live as configured
-- =============================================================================
