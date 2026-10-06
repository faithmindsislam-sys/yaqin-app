-- External generation/RAG workers use privileged DATABASE_URL connections.
-- No browser access: RLS without policies also protects future accidental grants.
-- These external-service tables need not exist in a standalone Yaqin installation.
do $$
declare relation text;
begin
  foreach relation in array array['gen_jobs', 'kb_leases'] loop
    if to_regclass('public.' || relation) is not null then
      execute format('alter table public.%I enable row level security', relation);
      execute format('revoke all privileges on table public.%I from public, anon, authenticated', relation);
    end if;
  end loop;
end $$;

-- Staff SELECT policies require this caller-only lookup. Keep its definer and
-- fixed search_path; removing authenticated EXECUTE would break those policies.
revoke execute on function public.current_role_name() from public, anon;
grant execute on function public.current_role_name() to authenticated;

-- Trigger execution does not require callers to have direct EXECUTE privileges.
-- Keep the existing triggers, owners, definer bodies and fixed search paths.
revoke execute on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke execute on function public.sync_auth_email_language() from public, anon, authenticated, service_role;
