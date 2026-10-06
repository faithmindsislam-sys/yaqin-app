import asyncio
import time
from types import SimpleNamespace

import pytest

from app.configuration.settings import Settings
from app.domain.errors import ApiError
from app.domain.operations import CURRENT, Budget, bounded, configure
from app.domain.users import User
from app.http.auth import current_user
from app.main import app


async def test_operation_wall_time_cancels_work_and_uses_fixed_error():
    configure(SimpleNamespace(tutor_seconds=.01, tutor_tokens=10000, tutor_model_calls=1))
    @bounded("tutor")
    async def hang():
        await asyncio.sleep(10)
    with pytest.raises(ApiError) as failure:
        await hang()
    assert failure.value.code == "operation_budget_exceeded"


def test_failed_call_reservation_and_unknown_usage_are_distinct():
    budget = Budget(time.monotonic()+10, 10000, 1)
    budget.reserve("question", 10)
    with pytest.raises(ApiError):
        budget.reserve("question", 10)
    assert budget.model_calls == 1 and budget.reserved_tokens > 0 and budget.usage_calls == 0
    budget.usage(3, 5)
    assert budget.actual_tokens == 8 and budget.usage_calls == budget.model_calls


async def test_bounded_operations_attribute_authenticated_and_background_users(monkeypatch):
    from unittest.mock import AsyncMock
    monkeypatch.setattr("app.domain.operations.SETTINGS", None)
    repository = SimpleNamespace(begin_model_usage=AsyncMock(), finish_model_usage=AsyncMock())
    class Service:
        def __init__(self):
            self.repository = repository

        @bounded("review")
        async def run(self, draft, user):
            return await CURRENT.get().begin_usage()

        @bounded("tutor")
        async def ask(self, req, *, user_id):
            return await CURRENT.get().begin_usage()

    service = Service()
    await service.run({}, User(id="actor", role="teacher"))
    await service.ask({}, user_id="learner")
    assert [call.args[0] for call in repository.begin_model_usage.call_args_list] == ["actor", "learner"]
    assert CURRENT.get() is None


@pytest.mark.parametrize("url", ["http://host", "https://user:pass@host", "https://host?secret=x",
                                    "https://host/#x", "https://host/path", "https://host:444"])
def test_service_origin_rejects_credentials_url_extras_and_plaintext(url):
    with pytest.raises(ValueError):
        Settings(_env_file=None, agents_service_url=url)


def test_spoofed_forwarded_ip_cannot_reset_authenticated_quota(client, monkeypatch):
    from app.configuration.settings import get_settings
    app.dependency_overrides[current_user] = lambda: User(id="00000000-0000-0000-0000-000000000001", role="learner")
    monkeypatch.setenv("TUTOR_RATE_PER_MINUTE", "1")
    get_settings.cache_clear()
    try:
        assert client.post("/api/tutor/ask", json={"question":"x"}, headers={"x-forwarded-for":"one"}).status_code == 200
        assert client.post("/api/tutor/ask", json={"question":"x"}, headers={"x-forwarded-for":"two"}).status_code == 429
    finally:
        app.dependency_overrides.clear()


async def test_interrupted_job_cannot_save_or_resurrect(client):
    store = app.state.services.repository
    user = User(id="00000000-0000-0000-0000-000000000001", role="teacher")
    job = await store.create_draft_job(user.id, "x", "ar", track="deepen")
    await store.update_draft_job(job["id"], status="failed", error="generation_interrupted")
    await store.update_draft_job(job["id"], status="running")
    assert (await store.get_draft_job(job["id"]))["status"] == "failed"
    with pytest.raises(ApiError):
        await store.save_draft({"id":"orphan"}, user.id, False, job_id=job["id"], job_result={})
    assert "orphan" not in store.lessons


def test_grounding_rejection_is_failed_not_no_sources(client, monkeypatch):
    app.dependency_overrides[current_user] = lambda: User(id="00000000-0000-0000-0000-000000000001", role="teacher")
    async def reject(*args, **kwargs):
        return {"lesson":None,"grounded":False,"reason_code":"source_support_rejected","reason":"private"}
    monkeypatch.setattr(app.state.services.lessons.author, "draft", reject)
    try:
        job = client.post("/api/review/draft",json={"prompt":"x","lang":"ar"}).json()["job_id"]
        for _ in range(50):
            result = client.get("/api/review/draft/"+job).json()
            if result["status"] != "running":
                break
            time.sleep(.01)
        assert result["status"] == "failed" and result["reason_code"] == "source_support_rejected"
        assert "private" not in result["reason"] and result["reason"] != "Source support could not be established."
    finally:
        app.dependency_overrides.clear()


def test_manual_course_actions_do_not_call_ai_or_reserve_budget(client, fake_llm, monkeypatch):
    from unittest.mock import AsyncMock
    from tests.api.test_lesson_management import draft

    app.dependency_overrides[current_user] = lambda: User(id="00000000-0000-0000-0000-000000000001", role="admin")
    deny = AsyncMock(side_effect=ApiError(429, "quota_exceeded", "Budget exhausted."))
    llm = fake_llm()
    llm.assess = AsyncMock(side_effect=AssertionError("Manual course actions must not call safety checks."))
    llm.structured = AsyncMock(side_effect=AssertionError("Manual course actions must not call a model."))
    monkeypatch.setattr(app.state.services.repository, "reserve_budget", deny)
    try:
        lesson = draft()
        assert client.post("/api/review/drafts", json=lesson).status_code == 200
        assert client.post("/api/review/test-management/submit").status_code == 200
        assert client.post("/api/review/test-management/decision", json={"decision": "approve"}).status_code == 200
        lesson["summary"]["en"] = "Updated without AI."
        response = client.post("/api/review/published", json=lesson)
        assert response.status_code == 200 and response.json()["status"] == "published"
        assert app.state.services.repository.lessons[lesson["id"]]["summary"] == lesson["summary"]
        deny.assert_not_awaited()
        llm.assess.assert_not_awaited()
        llm.structured.assert_not_awaited()
    finally:
        app.dependency_overrides.clear()


def test_ai_review_quota_denial_never_invokes_service(client, monkeypatch):
    from unittest.mock import AsyncMock
    app.dependency_overrides[current_user] = lambda: User(id="00000000-0000-0000-0000-000000000001",role="teacher")
    deny = AsyncMock(side_effect=ApiError(429,"quota_exceeded","Budget exhausted."))
    check = AsyncMock()
    monkeypatch.setattr(app.state.services.repository,"reserve_budget",deny)
    monkeypatch.setattr(app.state.services.lessons,"check",check)
    try:
        response = client.post("/api/review/check",json={})
        assert response.status_code == 429
        check.assert_not_called()
    finally:
        app.dependency_overrides.clear()
