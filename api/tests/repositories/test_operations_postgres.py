"""Real row-lock/transaction checks against a disposable verified-TLS cluster only."""
import asyncio
import json
import os
import ssl
from pathlib import Path
from uuid import UUID, uuid4

import asyncpg
import pytest

from app.configuration.settings import Settings
from app.domain.courses import DEFAULT_LEVELS, SUBJECTS
from app.domain.errors import ApiError
from app.repositories.postgres_repository import PostgresRepository

pytestmark = pytest.mark.skipif(not os.getenv("OPERATIONS_TEST_DATABASE_URL"), reason="Requires disposable TLS Postgres")


@pytest.fixture
async def store():
    async def init(c):
        await c.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    pool = await asyncpg.create_pool(os.environ["OPERATIONS_TEST_DATABASE_URL"], min_size=1, max_size=8, init=init,
                ssl=ssl.create_default_context(cafile=os.environ["DATABASE_SSL_CA_FILE"]))
    async with pool.acquire() as c:
        await c.execute((Path(__file__).parents[3]/"sql/operational_budgets.sql").read_text())
        await c.execute("TRUNCATE agent_private.model_budgets")
        await c.execute("""CREATE TABLE IF NOT EXISTS draft_jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            author_id uuid,prompt text,lang text,status text DEFAULT 'running', stage text DEFAULT 'queued',
            attempt int DEFAULT 0,result jsonb,lesson_id text,error text,created_at timestamptz DEFAULT now(),
            updated_at timestamptz DEFAULT now());""")
        await c.execute("""CREATE TABLE IF NOT EXISTS app_config(key text PRIMARY KEY,data jsonb,updated_at timestamptz DEFAULT now());
            CREATE TABLE IF NOT EXISTS lessons(id text PRIMARY KEY,track text,module text,status text,data jsonb,
                author_id uuid, updated_at timestamptz DEFAULT now());
            CREATE TABLE IF NOT EXISTS review_events(lesson_id text,actor_id uuid,kind text,payload jsonb);""")
        for key, value in (("tracks", [{"id":"explore","modules":[{"id":"intro","lessons":[]}]}]),
                           ("levels",DEFAULT_LEVELS),("subjects",SUBJECTS)):
            await c.execute("INSERT INTO app_config(key,data) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET data=excluded.data",key,value)
    try:
        yield PostgresRepository(pool)
    finally:
        await pool.close()


async def test_atomic_global_caps_and_denied_first_insert_roll_back(store):
    settings = Settings(_env_file=None, user_daily_tokens=100, service_daily_tokens=100, tutor_rate_per_minute=100)
    async def spend(i):
        try:
            return await store.reserve_budget(str(uuid4()), 30, settings)
        except ApiError:
            return False
    assert sum(await asyncio.gather(*(spend(i) for i in range(12)))) == 3
    async with store.pool.acquire() as c:
        assert await c.fetchval("SELECT reserved_tokens FROM agent_private.model_budgets WHERE principal='day:service' AND service='yaqin'") == 90
        await c.execute("TRUNCATE agent_private.model_budgets")
    with pytest.raises(ApiError):
        await store.reserve_budget(str(uuid4()), 101, settings)
    async with store.pool.acquire() as c:
        assert await c.fetchval("SELECT count(*) FROM agent_private.model_budgets") == 0


async def test_public_rate_limits_are_atomic_across_sessions_and_separate_from_model_limits(store):
    settings = Settings(_env_file=None, public_api_service_rate_per_minute=100,
                        public_api_rate_per_minute=3, tutor_rate_per_minute=1)
    uid = str(uuid4())
    async def request():
        try:
            return await store.reserve_budget(uid, 0, settings, public=True)
        except ApiError:
            return False
    # Simultaneous requests must not exceed the per-account limit.
    assert sum(await asyncio.gather(*(request() for _ in range(12)))) == 3
    assert await store.reserve_budget(uid, 1, settings)
    async with store.pool.acquire() as c:
        assert await c.fetchval("SELECT requests FROM agent_private.model_budgets "
                               "WHERE principal='minute:public:service' AND service='yaqin'") == 3
        assert await c.fetchval("SELECT reserved_tokens FROM agent_private.model_budgets "
                               "WHERE principal='day:service' AND service='yaqin'") == 1
        await c.execute("TRUNCATE agent_private.model_budgets")
    settings.public_api_service_rate_per_minute = 2
    async def another_user():
        try:
            return await store.reserve_budget(str(uuid4()), 0, settings, public=True)
        except ApiError:
            return False
    assert sum(await asyncio.gather(*(another_user() for _ in range(12)))) == 2


async def test_expired_and_completed_jobs_cannot_resurrect_or_write_orphans(store):
    uid = str(uuid4())
    job = await store.create_draft_job(uid,"topic","ar",track="deepen")
    async with store.pool.acquire() as c:
        await c.execute("UPDATE draft_jobs SET created_at=now()-interval '20 minutes' WHERE id=$1",UUID(job['id']))
    await store.expire_draft_jobs(510)
    await store.update_draft_job(job["id"], status="running")
    assert (await store.get_draft_job(job["id"]))["status"] == "failed"
    with pytest.raises(ApiError):
        await store.save_draft({"id":"orphan"},uid,False,job_id=job["id"],job_result={})
    assert (await store.get_draft_job(job["id"]))["result"]["track"] == "deepen"


async def test_atomic_completion_has_one_course_and_job_result_under_racing_workers(store):
    uid = str(uuid4())
    job = await store.create_draft_job(uid,"topic","en",track="explore")
    course = {"id":"generated-"+job["id"],"title":{"en":"Course","ar":"دورة"},
              "tracks":["explore"],"subject":"fiqh","level":1,"cards":[]}
    async def save():
        try:
            await store.save_draft(course,uid,False,job_id=job["id"],job_result={"track":"explore","lesson":course})
            return True
        except ApiError:
            return False
    assert sum(await asyncio.gather(save(),save())) == 1
    completed = await store.get_draft_job(job["id"])
    assert completed["status"] == "done" and completed["lesson_id"] == course["id"]
    async with store.pool.acquire() as c:
        assert await c.fetchval("SELECT count(*) FROM lessons WHERE id=$1",course["id"]) == 1
        assert await c.fetchval("SELECT count(*) FROM review_events WHERE lesson_id=$1",course["id"]) == 1


async def test_resume_claim_and_execution_token_fence_real_writes(store):
    uid = str(uuid4())
    job = await store.create_draft_job(uid, "topic", "en", track="explore")
    await store.update_draft_job(job["id"], status="failed", result={"_execution_token": "old"})
    failed = await store.get_draft_job(job["id"])
    result = {"_execution_token": "new", "_execution": 2, "_budget": {"calls": 4, "tokens": 800000}}
    assert not await store.claim_draft_job(job["id"], str(uuid4()), failed["updated_at"], result)
    claims = await asyncio.gather(*[store.claim_draft_job(job["id"], uid, failed["updated_at"], result) for _ in range(2)])
    assert sum(claims) == 1
    assert not await store.update_draft_job(job["id"], expected_token="old", status="failed")
    assert (await store.get_draft_job(job["id"]))["result"] == result
    course = {"id": "resumed-" + job["id"], "tracks": ["explore"], "subject": "fiqh", "level": 1, "cards": []}
    with pytest.raises(ApiError):
        await store.save_draft(course, uid, False, job_id=job["id"], job_token="old", job_result={"lesson": course})
    async with store.pool.acquire() as c:
        assert not await c.fetchval("SELECT id FROM lessons WHERE id=$1", course["id"])
    await store.save_draft(course, uid, False, job_id=job["id"], job_token="new", job_result={"lesson": course})
    assert (await store.get_draft_job(job["id"]))["status"] == "done"


async def test_resumed_expiry_uses_execution_start_and_retains_checkpoint_budget(store):
    from datetime import datetime, timedelta, timezone

    uid = str(uuid4())
    job = await store.create_draft_job(uid, "topic", "en")
    result = {"_started_at": datetime.now(timezone.utc).isoformat(), "_checkpoint": {"phase": "checking"},
              "_budget": {"calls": 4, "tokens": 800000}}
    await store.update_draft_job(job["id"], result=result)
    async with store.pool.acquire() as c:
        await c.execute("UPDATE draft_jobs SET created_at=now()-interval '20 minutes' WHERE id=$1", UUID(job["id"]))
    await store.expire_draft_jobs(510)
    assert (await store.get_draft_job(job["id"]))["status"] == "running"
    result["_started_at"] = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
    await store.update_draft_job(job["id"], result=result)
    await store.expire_draft_jobs(510)
    expired = await store.get_draft_job(job["id"])
    assert expired["status"] == "failed" and expired["error"] == "generation_interrupted"
    assert expired["result"] == result


async def test_persistence_failure_rolls_back_course_and_keeps_running_job(store):
    uid = str(uuid4())
    job = await store.create_draft_job(uid,"topic","en")
    course = {"id":"rollback-"+job["id"],"tracks":["explore"],"subject":"fiqh","level":1,"cards":[]}
    async with store.pool.acquire() as c:
        await c.execute("ALTER TABLE review_events ADD CONSTRAINT fail_test CHECK(kind <> 'created') NOT VALID")
    try:
        with pytest.raises(asyncpg.CheckViolationError):
            await store.save_draft(course,uid,False,job_id=job["id"],job_result={"lesson":course})
        async with store.pool.acquire() as c:
            assert await c.fetchval("SELECT count(*) FROM lessons WHERE id=$1",course["id"]) == 0
        assert (await store.get_draft_job(job["id"]))["status"] == "running"
    finally:
        async with store.pool.acquire() as c:
            await c.execute("ALTER TABLE review_events DROP CONSTRAINT fail_test")
