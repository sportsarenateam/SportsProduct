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

## Deferred
- [ ] Razorpay payment gateway (after feature testing)
