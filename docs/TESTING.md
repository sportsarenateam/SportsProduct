# SportzArena — Module test checklist

Run automated helpers anytime:

```bash
npm test --workspace=@arena/web
```

Then walk modules **one by one** in the browser (recommended for today).

## 0. Session
- [ ] Log in → open `/app` → hard refresh → stay logged in on same URL
- [ ] Open Sales → refresh → stay on `/app/sales`

## 1. Sport booking
- [ ] Select sport → courts → enter amount path / times → mobile exactly 10 digits
- [ ] Add Badminton Racket qty with **its own** +/− (other items unchanged)
- [ ] Save bill → **no invoice popup** → toast ~2s → entry in Sales → BOOKINGS

## 2. Beverages & Equipment
- [ ] No mobile field
- [ ] Name + items + save → Sales BOOKINGS (items only)

## 3. Coaching
- [ ] Start/end dates + amount (empty, not 0) → Sales COACHING

## 4. Billing & Membership
- [ ] User-entered amount → Sales MEMBERSHIP

## 5. Generate Invoice
- [ ] Save & preview → appears in **Saved invoices** list
- [ ] Preview again / Remove / WhatsApp (web) or Share (mobile)

## 6. Manage Menu
- [ ] Add court under Badminton (and other sports)
- [ ] New court appears on booking
- [ ] Edit price → leave field → price stays (stock may drop after selling items — that is stock, not price)

## Sales retention
- Sales rows stay in the database until you delete them — they do **not** reset next month.
- Use the month filter (and Export/Share CSV) to review a period.

## Deferred / payments
- [ ] Cashfree sandbox: Pay ₹499 on Subscribe → `arena_subscriptions.status` becomes `active`, period +30 days
- [ ] A canceled checkout remains only in `subscription_payment_attempts` with its customer email and Cashfree status; it does not change `arena_subscriptions`
- [ ] A successful checkout stores the owner email in `arena_subscriptions.billing_email` and issues an invoice with the same email
- [ ] Cashfree webhook on Render after deploy: `/webhooks/cashfree`

To inspect recent attempts in Supabase SQL Editor:

```sql
select created_at, cashfree_order_id, customer_email, plan_id, amount, currency, order_status
from public.subscription_payment_attempts
order by created_at desc
limit 50;
```
