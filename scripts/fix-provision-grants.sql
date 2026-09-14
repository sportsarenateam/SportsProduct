-- Fix grants for arena onboarding RPCs (optional after API direct-provisioning fix).
-- Run in Supabase SQL Editor on project pvwpopiisogorbgmevth if you still use RPC.

grant usage on schema private to service_role;

grant execute on function private.provision_owner_arena(uuid, text, text, text, text, text) to service_role;
grant execute on function public.provision_owner_arena(uuid, text, text, text, text, text) to service_role;
grant execute on function private.save_owner_onboarding_sports(uuid, text[]) to service_role;
grant execute on function public.save_owner_onboarding_sports(uuid, text[]) to service_role;

revoke usage on schema private from anon, authenticated;
revoke all on function public.provision_owner_arena(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.save_owner_onboarding_sports(uuid, text[]) from public, anon, authenticated;
