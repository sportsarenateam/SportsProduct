-- Cashfree payment order id on arena subscriptions (do not use razorpay_order_id).
alter table public.arena_subscriptions
  add column if not exists cashfree_order_id text;

create index if not exists arena_subscriptions_cashfree_order_idx
  on public.arena_subscriptions (cashfree_order_id);

-- Optional: drop legacy Razorpay order column if you no longer need it
-- alter table public.arena_subscriptions drop column if exists razorpay_order_id;
