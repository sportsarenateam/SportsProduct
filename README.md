# SportzArena

Multi-tenant web and mobile operations software for sports arenas. It records walk-in, membership, TurfTown, Playo, and other online-source sessions, payments, invoices, and expenses. Razorpay is exclusively for the arena's SaaS subscription.

## Apps
- `apps/web`: React/Vite owner, manager, and cashier console.
- `apps/mobile`: Expo staff ops (booking, coaching, membership, invoice, menu). See [docs/MOBILE.md](docs/MOBILE.md).
- `apps/api`: Express service for PDF invoices, XLSX reports, and signed Razorpay subscription webhooks.
- `supabase/migrations`: PostgreSQL schema, RBAC and RLS policies.

## Local setup
1. Install Node.js 20+ and npm 10+.
2. Copy `.env.example` to `.env` and fill in Supabase and Razorpay credentials. Never place service-role or Razorpay secret keys in a client app.
3. Create a Supabase project, then apply all SQL files in `supabase/migrations` in chronological order.
4. In Supabase Auth URL Configuration, set Site URL to `http://localhost:5173` and add `http://localhost:5173/auth/callback` and `http://localhost:5173/reset-password` as redirect URLs.
5. Enable the Supabase Email provider and Confirm Email. Start at `http://localhost:5173`, sign up with email/password, confirm the email, log in, create the arena, and select the sports/classes the arena manages. The API provisions the owner membership and 30-day trial atomically.
6. Run `npm install`, then start `npm run dev:web`, `npm run dev:api`, or `npm run start --workspace=@arena/mobile`.

## Security model
- Every tenant-owned record includes `organization_id`; Supabase RLS scopes access through active organization membership.
- Roles are owner, manager, and cashier. Cashiers can create sessions and payment records but cannot manage expenses, subscriptions, or staff.
- Invoice/subscription changes and Razorpay signatures belong on the API. Razorpay webhook event IDs are persisted to make processing idempotent.
- The browser uses the Supabase publishable key for Auth and ordinary RLS reads. It cannot call provisioning RPCs, alter memberships, or mutate subscriptions.
- The Express API validates the bearer token, derives the actor from it, then invokes service-role-only provisioning routines. `x-organization-id` is context only and is checked against the caller's active membership.
- Store receipt and invoice files under organization-prefixed Supabase Storage paths with matching storage RLS policies.

## Operational notes
- Timestamps are stored in UTC; render reports using the arena's configured IANA time zone.
- Customer payment methods are reconciliation entries (cash, UPI, GPay, card), not gateway collection or card storage.
- Treat issued invoices and payment corrections as audited records. Do not delete them.

## Subscription checkout
Configure Razorpay Test Mode plan IDs before enabling checkout. Checkout creation, signature verification, and signed webhook state changes are API-only; the browser callback is not the billing source of truth.

## Before production
- In Supabase Auth, enable CAPTCHA for signup/sign-in/reset flows and leaked-password protection, and configure custom SMTP plus password-change notifications.
- Require and validate Supabase bearer tokens on every Express route, then confirm the caller's organization role server-side.
- Add storage policies for invoice PDFs and expense receipts.
- Run `npm run typecheck`, `npm test`, database policy tests, and an end-to-end Razorpay webhook test before deployment.
