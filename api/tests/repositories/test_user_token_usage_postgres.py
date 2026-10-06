"""Read the actual quota ledger in a disposable local TLS Postgres cluster."""
import os
import ssl
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import asyncpg
import pytest

from app.repositories.postgres_repository import PostgresRepository

pytestmark = pytest.mark.skipif(not os.getenv("OPERATIONS_TEST_DATABASE_URL"), reason="Requires disposable TLS Postgres")


async def test_user_usage_reads_both_services_today_and_reports_unavailable(monkeypatch):
    url = os.environ["OPERATIONS_TEST_DATABASE_URL"]
    assert urlsplit(url).hostname in ("localhost", "127.0.0.1")
    day = 20700
    monkeypatch.setattr("app.repositories.postgres_repository.time.time", lambda: day * 86400 + 123)
    pool = await asyncpg.create_pool(url, min_size=1, max_size=1,
                                   ssl=ssl.create_default_context(cafile=os.environ["DATABASE_SSL_CA_FILE"]))
    repository = PostgresRepository(pool)
    target, unused = uuid4(), uuid4()
    query = f"usage-{target}"
    try:
        async with pool.acquire() as c:
            await c.execute("""CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS agent_private;
                CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY, email text,
                    banned_until timestamptz, last_sign_in_at timestamptz);
                CREATE TABLE IF NOT EXISTS public.profiles(id uuid PRIMARY KEY, display_name text,
                    role text, created_at timestamptz DEFAULT now());
                CREATE TABLE IF NOT EXISTS agent_private.model_budgets(service text, principal text,
                    period bigint, requests int DEFAULT 0, reserved_tokens bigint DEFAULT 0,
                    PRIMARY KEY(service,principal,period));""")
            await c.execute((Path(__file__).parents[3] / "sql/operational_budgets.sql").read_text())
            for uid in (target, unused):
                await c.execute("INSERT INTO auth.users(id,email) VALUES($1,$2)", uid, f"{query}-{uid}@example.test")
                await c.execute("INSERT INTO public.profiles(id,role) VALUES($1,'learner')", uid)
            await c.executemany("INSERT INTO agent_private.model_budgets(service,principal,period,reserved_tokens) VALUES($1,$2,$3,$4)", [
                ("yaqin", f"day:{target}", day, 200000),
                ("yaqin", f"day:{target}", day - 1, 9000000),
                ("standalone", f"day:{target}", day, 8000000),
                ("standalone", f"day:{target}", day - 1, 9000000),
                ("standalone", f"day:{unused}", day, 1800000),
                ("yaqin", "day:service", day, 1000000),
            ])
        # Each attempt is durable before its provider call; duplicate completion is harmless.
        await repository.begin_model_usage(str(target), "usage-first", day)
        await repository.finish_model_usage("usage-first", 120)
        await repository.finish_model_usage("usage-first", 999)
        await repository.begin_model_usage(str(target), "usage-timeout", day)
        await repository.begin_model_usage(str(target), "usage-retry", day)
        await repository.finish_model_usage("usage-retry", 80)
        await repository.begin_model_usage(str(target), "usage-yesterday", day - 1)
        await repository.finish_model_usage("usage-yesterday", 500)
        async with pool.acquire() as c:
            await c.execute("INSERT INTO agent_private.model_usage VALUES('standalone','standalone-first',$1,$2,600)", target, day)
            await c.execute("INSERT INTO agent_private.model_usage VALUES('standalone','standalone-unknown',$1,$2,NULL)", unused, day)
        result = await repository.search_users(query)
        actual = {r["id"]: r for r in result["items"]}
        assert actual[str(target)]["daily_actual_tokens"] == 200
        assert actual[str(target)]["daily_usage_unknown_calls"] == 1
        assert actual[str(target)]["standalone_daily_actual_tokens"] == 600
        assert actual[str(unused)]["daily_actual_tokens"] == 0
        assert actual[str(unused)]["daily_usage_unknown_calls"] == 0
        assert actual[str(unused)]["standalone_daily_actual_tokens"] == 0
        assert actual[str(unused)]["standalone_daily_usage_unknown_calls"] == 1
        assert {row["id"]: row["daily_reserved_tokens"] for row in result["items"]} == {str(target): 200000, str(unused): 0}
        assert {row["id"]: row["standalone_daily_reserved_tokens"] for row in result["items"]} == {
            str(target): 8000000, str(unused): 1800000}
        assert (await repository.search_users(f"{query}-{target}@", page_size=1))["items"][0]["daily_reserved_tokens"] == 200000
        async with pool.acquire() as c:
            await c.execute("ALTER TABLE agent_private.model_usage RENAME TO hidden_usage")
        try:
            missing = (await repository.search_users(query))["items"]
            assert all(row["daily_actual_tokens"] is None for row in missing)
            assert all(row["standalone_daily_actual_tokens"] is None for row in missing)
        finally:
            async with pool.acquire() as c:
                await c.execute("ALTER TABLE agent_private.hidden_usage RENAME TO model_usage")
        monkeypatch.setattr("app.repositories.postgres_repository.time.time", lambda: (day + 1) * 86400)
        assert all(row["daily_reserved_tokens"] == row["standalone_daily_reserved_tokens"] == 0
                   for row in (await repository.search_users(query))["items"])
        assert all(row["daily_actual_tokens"] == 0 for row in (await repository.search_users(query))["items"])
        monkeypatch.setattr("app.repositories.postgres_repository.time.time", lambda: day * 86400 + 123)
        async with pool.acquire() as c:
            await c.execute("ALTER TABLE agent_private.model_budgets RENAME TO hidden_budgets")
        try:
            unavailable = await repository.search_users(query)
            assert unavailable["total"] == 2
            assert all(row["daily_reserved_tokens"] is None for row in unavailable["items"])
            assert all(row["standalone_daily_reserved_tokens"] is None for row in unavailable["items"])
        finally:
            async with pool.acquire() as c:
                await c.execute("ALTER TABLE agent_private.hidden_budgets RENAME TO model_budgets")
        async with pool.acquire() as c:
            await c.execute("""CREATE ROLE token_usage_reader;
                GRANT USAGE ON SCHEMA public, auth, agent_private TO token_usage_reader;
                GRANT SELECT ON public.profiles, auth.users TO token_usage_reader;
                SET ROLE token_usage_reader;""")
        try:
            unreadable = await repository.search_users(query)
            assert unreadable["total"] == 2
            assert all(row["daily_reserved_tokens"] is None for row in unreadable["items"])
            assert all(row["standalone_daily_reserved_tokens"] is None for row in unreadable["items"])
            assert all(row["daily_actual_tokens"] is None for row in unreadable["items"])
        finally:
            async with pool.acquire() as c:
                await c.execute("RESET ROLE")
        async with pool.acquire() as c:
            await c.execute("""GRANT SELECT ON agent_private.model_budgets TO token_usage_reader;
                ALTER TABLE agent_private.model_budgets ENABLE ROW LEVEL SECURITY;
                CREATE POLICY main_only ON agent_private.model_budgets TO token_usage_reader USING(service='yaqin');
                GRANT SELECT ON agent_private.model_usage TO token_usage_reader;
                CREATE POLICY main_only ON agent_private.model_usage TO token_usage_reader USING(service='yaqin');
                SET ROLE token_usage_reader;""")
        try:
            restricted = await repository.search_users(query)
            assert {row["id"]: row["daily_reserved_tokens"] for row in restricted["items"]} == {
                str(target): 200000, str(unused): 0}
            assert all(row["standalone_daily_reserved_tokens"] is None for row in restricted["items"])
            assert next(row for row in restricted["items"] if row["id"] == str(target))["daily_actual_tokens"] == 200
            # The aggregate must be unavailable if RLS could silently hide rows.
            assert all(row["standalone_daily_actual_tokens"] is None for row in restricted["items"])
            async with pool.acquire() as c:
                assert await c.fetchval("show row_security") == "on"
                assert await c.fetchval("select count(*) from agent_private.model_budgets where service='standalone'") == 0
        finally:
            async with pool.acquire() as c:
                await c.execute("RESET ROLE")
    finally:
        await pool.close()
