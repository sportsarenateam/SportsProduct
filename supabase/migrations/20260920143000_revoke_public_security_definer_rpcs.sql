-- Harden legacy SECURITY DEFINER RPCs still exposed in public schema.
-- App traffic goes through the Express API (service_role); clients must not call these directly.
-- Look up live signatures so this does not fail if a function was moved, renamed, or never created.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname in ('create_arena_session', 'dashboard_summary', 'rls_auto_enable')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;
