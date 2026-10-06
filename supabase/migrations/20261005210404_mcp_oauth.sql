-- Apply before enabling MCP. Register clients in Supabase, then explicitly approve
-- their IDs in mcp_private.clients. An empty allowlist grants no MCP access.
begin;

create schema if not exists mcp_private;
revoke all on schema mcp_private from public, anon, authenticated;
grant usage on schema mcp_private to supabase_auth_admin;

create table mcp_private.clients (
  client_id uuid primary key references auth.oauth_clients(id) on delete cascade,
  enabled boolean not null default true
);
alter table mcp_private.clients enable row level security;
revoke all on mcp_private.clients from public, anon, authenticated;
grant select on mcp_private.clients to supabase_auth_admin;
create policy "Auth reads approved MCP clients" on mcp_private.clients
  for select to supabase_auth_admin using (true);

create function public.mcp_access_token_hook(event jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  claims jsonb := event -> 'claims';
  granted_scopes text;
begin
  -- Google/password/mobile sessions keep their existing claims and audience.
  if nullif(claims ->> 'client_id', '') is null then
    return jsonb_build_object('claims', claims);
  end if;

  -- Authoritative Auth rows bind the user, OAuth client, session and live consent.
  -- Never take permissions/resource URLs from user_metadata or request parameters.
  select s.scopes into granted_scopes
  from auth.sessions s
  join auth.oauth_clients c on c.id = s.oauth_client_id and c.deleted_at is null
  join mcp_private.clients a on a.client_id = c.id and a.enabled
  join auth.oauth_consents g on g.client_id = c.id and g.user_id = s.user_id
  where s.id = (claims ->> 'session_id')::uuid
    and s.user_id = (event ->> 'user_id')::uuid
    and s.user_id = (claims ->> 'sub')::uuid
    and c.id = (claims ->> 'client_id')::uuid
    and g.revoked_at is null
    and (s.not_after is null or s.not_after > now())
    and 'openid' = any(string_to_array(g.scopes, ' '));

  if granted_scopes is null or not ('openid' = any(string_to_array(granted_scopes, ' '))) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403, 'message', 'This MCP client has no active authorization.'));
  end if;

  claims := jsonb_set(claims, '{aud}', '"https://public-api.yaqeenguide.com/api/v1/mcp/"');
  claims := jsonb_set(claims, '{scope}', to_jsonb(granted_scopes));
  return jsonb_build_object('claims', claims);
end;
$$;
revoke all on function public.mcp_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.mcp_access_token_hook(jsonb) to supabase_auth_admin;

-- OAuth tokens can reach only MCP, even if the Data API accepts their audience.
-- Restrictive policies also constrain existing permissive learner/staff policies.
do $$
declare target record;
begin
  for target in select c.relname from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
  loop
    execute format('create policy "Direct app sessions only" on public.%I as restrictive
      for all to authenticated using (nullif(auth.jwt()->>''client_id'', '''') is null)
      with check (nullif(auth.jwt()->>''client_id'', '''') is null)', target.relname);
  end loop;
end;
$$;

commit;
