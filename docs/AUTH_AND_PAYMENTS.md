# Auth (OTP-first) + Razorpay payments

## Production login design (correct)

```
1. Enter email
2. Receive OTP (Resend via Supabase SMTP)
3. Verify OTP
4. First time (no password yet) → Create password + confirm password
5a. Existing owner with arena  → Dashboard
5b. New / no arena yet        → Name arena → Choose sports → Dashboard (30-day trial)
5c. Invited staff             → Dashboard (same arena; no Sales Report)
```

Next visits: **Password** tab **or** Email OTP.

| Step | Creates Auth user? | Creates arena? | Sets password? |
|---|---|---|---|
| Send OTP (`shouldCreateUser: true`) | Yes, on first OTP if new | No | No |
| Verify OTP | Session starts | No | No |
| Set password + confirm | — | No | Yes (hashed by Supabase) |
| Name arena onboarding | — | Yes + trial (owner only) | — |
| Owner invites staff | Auth user if needed + `manager` membership | No | Staff sets via OTP |

### Owner vs Staff

- **Owner** = account that created the arena (e.g. CTC). Sees all modules including Sales Report; can add staff under Profile.
- **Staff** = `manager` membership. Sees booking, coaching, membership, invoice, menu, profile — **not** Sales Report.
### Why password login failed for OTP-only users

OTP creates the Auth user but the owner never chose a password. Password login only works **after** the set-password step (or Forgot password).

### Reset password = OTP (not link)

In Supabase Dashboard → **Authentication → Email Templates → Reset password**, put the **6-digit code** in the body:

```html
<p>Your code is {{ .Token }}</p>
```

Remove or ignore `{{ .ConfirmationURL }}` if you only want OTP. The app flow is: email → OTP → new password + confirm.


---

## Payment flow

```
Trial → Upgrade / trial ended → Razorpay ₹499 → arena_subscriptions.status = active
```

Live keys: `rzp_live_...` in `.env` when going to production. See [PRODUCTION_SECURITY.md](./PRODUCTION_SECURITY.md).

---

## After deleting a user

- Same email can start again with **Email → OTP** (new Auth user).
- They must set password again, then complete **arena name** if the old org was also deleted.
