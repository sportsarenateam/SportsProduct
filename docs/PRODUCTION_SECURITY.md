# Production security checklist

Use this before going live with OTP login + payments.

## Passwords & OTP in the browser (important)

If you open DevTools → Network and see:

```json
{ "email": "...", "password": "..." }
```

that is **normal**. You are looking at the request **inside your browser** before TLS. On the internet the connection to `*.supabase.co` is **HTTPS**, so a network attacker cannot read that body in clear text.

**Do not add custom “encrypt password in the payload” in the app.**  
Supabase Auth expects the password over HTTPS, then stores a **bcrypt hash** only (`auth.users.encrypted_password`). Client-side encryption would break login and is not more secure (the decrypt key would ship in JavaScript).

Same for OTP: the 6-digit code is sent over HTTPS to `/auth/v1/verify`; Supabase checks it server-side.

| Layer | What protects you |
|--------|-------------------|
| Transit | HTTPS / TLS to Supabase |
| Storage | bcrypt hash (never store raw passwords in your tables) |
| SQL injection | Supabase Auth + PostgREST use parameterized queries; our API uses Zod + supabase-js (no raw SQL strings) |
| Data access | RLS + API JWT + `service_role` only on the server |
| Browser | Publishable/anon key only — **never** put `service_role` in `VITE_*` |

## Passwords (hashing)

- [x] **Do not encrypt passwords in the app.** Supabase Auth stores a **bcrypt hash**. Clients only send plaintext over HTTPS to Auth; never write passwords into your own tables.
- [x] After OTP, require **password + confirm** (`/onboarding/password`) and mark `user_metadata.password_set = true`.
- [ ] Dashboard → Authentication → Providers → Email: min password length **8+**; keep Confirm email **off** for OTP-first (OTP already proves email).
- [ ] Prefer HTTPS only in production (Vercel / custom domain).
- [ ] If a password was ever pasted into chat, tickets, or screenshots — **change it** immediately.

## Auth & sessions

- [ ] Site URL + redirect allow list include production URL and `…/auth/callback`.
- [ ] Magic Link / Recovery templates include `{{ .Token }}` for OTP codes.
- [ ] Publishable/anon key only in the web app; **service role never** in `VITE_*` or browser.
- [ ] JWT expiry reasonable; owners can use Forgot password + OTP anytime.

## Payments (Razorpay → PhonePe later)

- [x] Order created on **API** with secret key; amount not trusted from the client alone.
- [x] Payment verified with **HMAC signature** (`/subscriptions/verify`) before setting `arena_subscriptions.status = active`.
- [ ] Switch `.env` to live payment keys for production; remove test keys from prod hosts.
- [ ] Set webhook secrets and verify signatures.
- [ ] Never log full card/UPI payloads; never store PAN/CVV (hosted checkout only).

## Data & API (SQL injection / abuse)

- [x] App does **not** run user input as SQL — queries go through supabase-js / PostgREST.
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
2. Log out → password login works (registered email should not spam OTP).  
3. Forgot password → OTP → new password + confirm → login.  
4. Trial → Upgrade → pay → status `active`.  
5. Confirm service role key is absent from the built frontend bundle.
