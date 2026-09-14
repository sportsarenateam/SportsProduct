-- service_role must resolve private.* when calling public wrappers (security invoker).
grant usage on schema private to service_role;

grant execute on function private.provision_owner_arena(uuid, text, text, text, text, text) to service_role;
grant execute on function public.provision_owner_arena(uuid, text, text, text, text, text) to service_role;
grant execute on function private.save_owner_onboarding_sports(uuid, text[]) to service_role;
grant execute on function public.save_owner_onboarding_sports(uuid, text[]) to service_role;

-- Keep browser roles locked out of private schema.
revoke usage on schema private from anon, authenticated;
revoke all on function public.provision_owner_arena(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.save_owner_onboarding_sports(uuid, text[]) from public, anon, authenticated;
