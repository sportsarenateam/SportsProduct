-- Quick fix if tables already exist but API gets:
--   permission denied for table organizations
-- Run in Supabase SQL Editor (new project).

grant usage on schema public to service_role;
grant usage on schema private to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;

grant all on table public.organizations to service_role;
grant all on table public.organization_memberships to service_role;
grant all on table public.arena_subscriptions to service_role;
grant all on table public.profiles to service_role;
grant all on table public.sports to service_role;
grant all on table public.activity_log to service_role;

-- Browser clients must not create arenas directly
revoke insert, update, delete on table public.organizations from anon, authenticated;
revoke insert, update, delete on table public.organization_memberships from anon, authenticated;
revoke insert, update, delete on table public.arena_subscriptions from anon, authenticated;
