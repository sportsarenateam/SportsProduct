# Resend + Supabase email (OTP, verify, forgot password)

SportzArena does **not** send OTP from the API. Supabase Auth sends mail through **SMTP**.  
Configure **Resend** as that SMTP provider with your domain `sportsarena.team`.

## 1. Resend — verify domain

1. Open [Resend Domains](https://resend.com/domains) → **Add Domain** → `sportsarena.team`
2. Add the DNS records Resend shows in **Hostinger** (SPF, DKIM, optionally DMARC)
3. Wait until Resend status is **Verified**
4. Create an API key in Resend (starts with `re_…`)

Recommended sender: `noreply@sportsarena.team` (or `auth@sportsarena.team`)

## 2. Supabase — custom SMTP

1. Supabase Dashboard → **Project Settings → Authentication → SMTP Settings** (or Auth → Emails → SMTP)
2. Enable **Custom SMTP**:
   - Host: `smtp.resend.com`
   - Port: `465` (SSL) or `587`
   - Username: `resend`
   - Password: your Resend API key `re_…`
   - Sender email: `noreply@sportsarena.team`
   - Sender name: `SportzArena`
3. Save

Do **not** put the Resend API key in Vercel `VITE_*` or the browser.

## 3. Supabase — URL allow list (required for links)

**Authentication → URL Configuration**

- **Site URL:** `https://sportsarena.team`
- **Redirect URLs** include:
  - `https://sportsarena.team/**`
  - `https://www.sportsarena.team/**`
  - `https://sportsarena.team/auth/callback`
  - `https://sportsarena.team/reset-password`
  - `https://sportsarena.team/forgot-password`
  - Keep `http://localhost:5173/**` for local dev

## 4. Email templates (OTP codes)

**Authentication → Email Templates**

For **Magic Link**, **Confirm signup**, and **Reset password**, include the OTP token, for example:

```html
<p>Your SportzArena code is: <strong>{{ .Token }}</strong></p>
<p>Or open this link: <a href="{{ .ConfirmationURL }}">Continue</a></p>
```

Without `{{ .Token }}`, the in-app 6-digit OTP UI will not match the email.

## 5. Auth provider settings

**Authentication → Providers → Email**

- Enable Email
- Min password length: **8+**
- For OTP-first login, Confirm email can stay off for magic-link/OTP (OTP already proves inbox)
- Enable **Secure email change** if available

## 6. What the app already calls

| Action | Client API |
|--------|------------|
| Login / signup OTP | `supabase.auth.signInWithOtp` |
| Verify OTP | `supabase.auth.verifyOtp` |
| Forgot password | `supabase.auth.resetPasswordForEmail` |
| Set new password | `supabase.auth.updateUser({ password })` |
| Password signup (API) | `POST /auth/register` then **confirm email** before password login |

## 7. Smoke test

1. New email → OTP → code arrives from `noreply@sportsarena.team` → verify → set password  
2. Log out → password login  
3. Forgot password → OTP / link → set new password → login  
4. Check Resend dashboard logs for deliveries (not spam)

## 8. Render env (API)

```env
APP_URL=https://sportsarena.team
CASHFREE_WEBHOOK_SECRET=your-cashfree-webhook-secret
```

## 9. Vercel env (web)

```env
VITE_API_URL=https://api.sportsarena.team
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Never use `VITE_APP_URL` — the app reads **`VITE_API_URL`** only.
