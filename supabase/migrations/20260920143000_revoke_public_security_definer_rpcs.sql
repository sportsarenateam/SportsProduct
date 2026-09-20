-- Harden legacy SECURITY DEFINER RPCs still exposed in public schema.
-- App traffic goes through the Express API (service_role); clients must not call these directly.

revoke all on function public.create_arena_session(
  uuid, uuid, uuid, uuid, text, public.booking_source, timestamptz, timestamptz,
  numeric, numeric, public.payment_method, numeric, text, uuid
) from public, anon, authenticated;

revoke all on function public.dashboard_summary(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;

grant execute on function public.create_arena_session(
  uuid, uuid, uuid, uuid, text, public.booking_source, timestamptz, timestamptz,
  numeric, numeric, public.payment_method, numeric, text, uuid
) to service_role;

grant execute on function public.dashboard_summary(uuid, timestamptz, timestamptz)
  to service_role;

grant execute on function public.rls_auto_enable() to service_role;
