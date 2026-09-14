# Production security checklist

Use this before going live with OTP login + Razorpay.

## Passwords (encryption / hashing)

- [x] **Do not encrypt passwords in the app.** Supabase Auth stores a **bcrypt hash** (`auth.users.encrypted_password`). Clients only send plaintext over HTTPS to Auth; never write passwords into your own tables.
- [x] After OTP, require **password + confirm** (`/onboarding/password`) and mark `user_metadata.password_set = true`.
- [ ] Dashboard → Authentication → Providers → Email: min password length **8+**; keep Confirm email **off** for OTP-first (OTP already proves email).
- [ ] Prefer HTTPS only in production (Vercel / custom domain).

## Auth & sessions

- [ ] Site URL + redirect allow list include production URL and `…/auth/callback`.
- [ ] Magic Link / Recovery templates include `{{ .Token }}` for OTP codes.
- [ ] Publishable/anon key only in the web app; **service role never** in `VITE_*` or browser.
- [ ] JWT expiry reasonable; owners can use Forgot password + OTP anytime.

## Payments (Razorpay)

- [x] Order created on **API** with secret key; amount not trusted from the client alone.
- [x] Payment verified with **HMAC signature** (`/subscriptions/verify`) before setting `arena_subscriptions.status = active`.
- [ ] Switch `.env` to `rzp_live_…` keys for production; remove test keys from prod hosts.
- [ ] Set `RAZORPAY_WEBHOOK_SECRET` and verify webhooks if you enable them.
- [ ] Never log full card/UPI payloads; never store PAN/CVV (Razorpay hosted checkout only).

## Data & API

- [ ] RLS enabled on all `public` tables; policies match owner membership.
- [ ] API checks Bearer JWT and organization membership before ops/billing routes.
- [ ] `.env` / secrets not committed; rotate keys if ever leaked.
- Sales / coaching / membership bills and **generated invoices** are retained until deleted — no month-end wipe.

## Email (Resend)

- [ ] Verified **sending domain** (not `onboarding@resend.dev`) before inviting real customers / staff.
- [ ] Sender address uses that verified domain in Supabase SMTP settings.
- [ ] **Staff OTP:** `onboarding@resend.dev` only delivers to your Resend account email. Any other staff address needs a verified domain (or set a password in Supabase Dashboard for that user to test Password login).

## Smoke test before launch

1. New email → OTP → set password + confirm → name arena → sports → dashboard.  
2. Log out → password login works.  
3. Forgot password → OTP → new password + confirm → login.  
4. Trial → Upgrade → Razorpay test/live pay → status `active`.  
5. Confirm service role key is absent from the built frontend bundle.
