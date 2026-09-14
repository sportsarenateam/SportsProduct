# Where users are stored

Signed-up owners live in **Supabase Auth**, not a custom `users` table.

| Table / schema | What it holds |
|---|---|
| `auth.users` | Email, password hash, last sign-in (login identity) |
| `public.profiles` | Display name (`id` = `auth.users.id`) |
| `public.organization_memberships` | Links user → arena (`role` owner/manager/…) |
| `public.organizations` | Arena (e.g. CTC) |
| `public.arena_subscriptions` | Trial / paid status |

## List all signed-up users (copy into Supabase SQL Editor)

```sql
select
  u.id as user_id,
  u.email,
  u.created_at as signed_up_at,
  u.last_sign_in_at,
  p.full_name,
  o.id as organization_id,
  o.name as arena_name,
  m.role,
  s.status as subscription_status,
  s.trial_ends_at,
  s.current_period_ends_at
from auth.users u
left join public.profiles p on p.id = u.id
left join public.organization_memberships m
  on m.user_id = u.id and m.active = true
left join public.organizations o on o.id = m.organization_id
left join public.arena_subscriptions s on s.organization_id = o.id
order by u.created_at desc;
```

Current known owner: `naveengurumoorthy69@gmail.com` → arena **CTC**.

## Delete a user (recommended)

**Easiest after FK fix:** Supabase Dashboard → **Authentication → Users** → Delete user.

If you still see `activity_log_actor_id_fkey` (or similar), run this first for that user id, then delete in the Dashboard:

```sql
-- Replace with the user id from the list query
-- example: ab1886de-8927-495d-82b0-3c9d64616198
do $$
declare
  v_user uuid := 'ab1886de-8927-495d-82b0-3c9d64616198';
begin
  update public.activity_log set actor_id = null where actor_id = v_user;
  update public.sessions set created_by = null where created_by = v_user;
  update public.session_payments set recorded_by = null where recorded_by = v_user;
  update public.expenses set recorded_by = null where recorded_by = v_user;
  update public.pos_transactions set created_by = null where created_by = v_user;
  update public.coaching_registrations set created_by = null where created_by = v_user;
  update public.membership_billing set created_by = null where created_by = v_user;
end $$;
```

Then delete the user in **Authentication → Users**.

Optional: remove the arena org afterward (cascades org data):

```sql
delete from public.organizations
where id = 'a9f67169-7e23-4a8d-bf96-65c2027dc06e';  -- CTC example
```

A migration sets these FKs to `ON DELETE SET NULL` so future deletes do not hit the same error.

## Find one email

```sql
select id, email, created_at, last_sign_in_at
from auth.users
where email = 'someone@example.com';
```

## Set staff password for testing (SQL Editor)

Replace the email and password, then run:

```sql
-- 1) Confirm the staff user exists
select u.id, u.email, m.role, m.active, o.name as arena
from auth.users u
join public.organization_memberships m on m.user_id = u.id
join public.organizations o on o.id = m.organization_id
where m.role = 'manager'
order by u.created_at desc;

-- 2) Set password + mark password_set (required by the web app)
update auth.users
set
  encrypted_password = crypt('TestStaff@123', gen_salt('bf')),
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('password_set', true),
  updated_at = now()
where lower(email) = lower('staff@example.com');
```

Then in the app: **Login → Password** with that email and `TestStaff@123`.

Prefer Dashboard → Authentication → Users → user → Reset/Set password when possible; SQL is for quick local testing only.
## Owner vs Staff (web)

| | **Owner** (creates the arena, e.g. CTC) | **Staff** (DB role `manager`) |
|---|---|---|
| Who | Completes arena onboarding | Invited by owner from **Profile → Staff** |
| Modules | All, including **Sales Report** | All **except** Sales Report |
| Arena / sports / plan | Yes | No — uses the owner’s arena |
| Login | Email OTP → set password, or password | Same after invite |

Staff do **not** create a new arena. After login, bootstrap finds their membership and opens `/app`.

API: `GET/POST /ops/staff`, `DELETE /ops/staff/:userId` (owner only). Sales Report data (`GET /ops/transactions`) is owner only.