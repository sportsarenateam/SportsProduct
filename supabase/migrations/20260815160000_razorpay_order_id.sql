alter table public.arena_subscriptions
  add column if not exists razorpay_order_id text;

create index if not exists arena_subscriptions_order_idx
  on public.arena_subscriptions (razorpay_order_id);
