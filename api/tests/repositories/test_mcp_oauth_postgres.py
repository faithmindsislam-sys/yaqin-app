"""Exercise real Auth-shaped rows, hook permissions, revocation and RLS in a disposable database."""
import json
import os
import ssl
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4

import asyncpg
import pytest

pytestmark = pytest.mark.skipif(not os.getenv("OPERATIONS_TEST_DATABASE_URL"), reason="Requires disposable TLS Postgres")


async def test_mcp_hook_preserves_app_sessions_and_enforces_live_authorization():
    url = os.environ["OPERATIONS_TEST_DATABASE_URL"]
    tls = ssl.create_default_context(cafile=os.environ["DATABASE_SSL_CA_FILE"])
    admin = await asyncpg.connect(url, ssl=tls)
    database = "mcp_check_" + uuid4().hex
    await admin.execute(f'CREATE DATABASE "{database}"')
    pool = None
    try:
        await admin.execute("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='supabase_auth_admin') THEN CREATE ROLE supabase_auth_admin; END IF; END $$")
        parts = urlsplit(url)
        test_url = urlunsplit(parts._replace(path="/" + database))
        async def codecs(c):
            await c.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
        pool = await asyncpg.create_pool(test_url, ssl=tls, init=codecs, min_size=1, max_size=2)
        user, client, session = uuid4(), uuid4(), uuid4()
        async with pool.acquire() as c:
            await c.execute("""create schema auth;
              create table auth.oauth_clients(id uuid primary key, deleted_at timestamptz);
              create table auth.sessions(id uuid primary key, user_id uuid, oauth_client_id uuid,
                scopes text, not_after timestamptz);
              create table auth.oauth_consents(user_id uuid, client_id uuid, scopes text, revoked_at timestamptz);
              grant usage on schema auth to supabase_auth_admin, authenticated;
              grant select on all tables in schema auth to supabase_auth_admin;
              create function auth.jwt() returns jsonb language sql stable as
                'select current_setting(''request.jwt.claims'', true)::jsonb';
              create table public.private_profile(id uuid primary key);
              alter table public.private_profile enable row level security;
              grant select on public.private_profile to authenticated;
              create policy own_profile on public.private_profile for select to authenticated
                using (id::text = auth.jwt()->>'sub');""")
            await c.execute("INSERT INTO public.private_profile VALUES($1)", user)
            migration = next((Path(__file__).parents[3] / "supabase/migrations").glob("*_mcp_oauth.sql"))
            await c.execute(migration.read_text())
            await c.execute("INSERT INTO auth.oauth_clients VALUES($1,NULL)", client)
            await c.execute("INSERT INTO auth.sessions VALUES($1,$2,$3,'openid',NULL)", session, user, client)
            await c.execute("INSERT INTO auth.oauth_consents VALUES($1,$2,'openid',NULL)", user, client)
            await c.execute("INSERT INTO mcp_private.clients VALUES($1,true)", client)

        claims = {"sub": str(user), "session_id": str(session), "aud": "authenticated",
                  "client_id": str(client), "role": "authenticated", "user_metadata": {"aud": "https://evil.test"}}
        event = {"user_id": str(user), "claims": claims, "authentication_method": "token_refresh"}
        async with pool.acquire() as c:
            await c.execute("SET ROLE supabase_auth_admin")
            result = await c.fetchval("SELECT public.mcp_access_token_hook($1::jsonb)", event)
            assert result["claims"] == {**claims, "aud": "https://public-api.yaqeenguide.com/api/v1/mcp/", "scope": "openid"}
            app_claims = {k: v for k, v in claims.items() if k != "client_id"}
            app_event = {**event, "claims": app_claims, "authentication_method": "password"}
            assert await c.fetchval("SELECT public.mcp_access_token_hook($1::jsonb)", app_event) == {"claims": app_claims}
            await c.execute("RESET ROLE")

            # Private Data API tables still work for app sessions but reject OAuth JWTs.
            for current, expected in ((app_claims, 1), (result["claims"], 0)):
                await c.execute("SELECT set_config('request.jwt.claims',$1,false)", json.dumps(current))
                await c.execute("SET ROLE authenticated")
                assert await c.fetchval("SELECT count(*) FROM public.private_profile") == expected
                with pytest.raises(asyncpg.InsufficientPrivilegeError):
                    await c.fetchval("SELECT public.mcp_access_token_hook($1::jsonb)", event)
                await c.execute("RESET ROLE")

            await c.execute("UPDATE auth.oauth_consents SET revoked_at=now()")
        async with pool.acquire() as c:
            await c.execute("SET ROLE supabase_auth_admin")
            assert (await c.fetchval("SELECT public.mcp_access_token_hook($1::jsonb)", event))["error"]["http_code"] == 403
            await c.execute("RESET ROLE")
            await c.execute("UPDATE auth.oauth_consents SET revoked_at=NULL")
            await c.execute("UPDATE mcp_private.clients SET enabled=false")
        async with pool.acquire() as c:
            await c.execute("SET ROLE supabase_auth_admin")
            assert (await c.fetchval("SELECT public.mcp_access_token_hook($1::jsonb)", event))["error"]["http_code"] == 403
            await c.execute("RESET ROLE")
            await c.execute("UPDATE mcp_private.clients SET enabled=true")
            await c.execute("UPDATE auth.oauth_clients SET deleted_at=now()")
            await c.execute("SET ROLE supabase_auth_admin")
            assert (await c.fetchval("SELECT public.mcp_access_token_hook($1::jsonb)", event))["error"]["http_code"] == 403
            await c.execute("RESET ROLE")
    finally:
        if pool:
            await pool.close()
        await admin.execute(f'DROP DATABASE "{database}" WITH (FORCE)')
        await admin.close()
