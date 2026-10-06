"""No prose laundering or cached support pass across changed source snapshots."""

import copy

import pytest

from app.agents.course.agent import CourseAgent
from app.agents.review.agent import ReviewAgent
from app.domain.errors import ApiError
from app.domain.search import Retrieved
from app.domain.users import User
from app.repositories.memory_repository import MemoryRepository
from app.services.lesson_service import LessonService
from tests.agents.test_course_agent import FakeLLM, FakeRepo, FakeRetrieval, _agent, _approved_source, _good_draft
from tests.api.test_source_support import judge
from tests.conftest import FIXTURES


@pytest.mark.parametrize("change", ["text", "withdrawn", "outage"])
async def test_course_finalization_withholds_entire_prose_and_quiz(change):
    original = {"s1": _approved_source("s1")}
    repo = FakeRepo(copy.deepcopy(original))
    llm = FakeLLM(_good_draft(), {"issues": []})
    structured = llm.structured

    async def written(**kwargs):
        result = await structured(**kwargs)
        if change == "text":
            repo._sources["s1"]["text_en"] = "Changed original evidence."
        elif change == "withdrawn":
            repo._sources["s1"]["review_status"] = "pending"
        else:

            async def unavailable(ids):
                raise RuntimeError("private database detail")

            repo.get_sources = unavailable
        return result

    llm.structured = written
    author = CourseAgent(repo, llm, FakeRetrieval(Retrieved(original, {"s1": 0.9})))
    output = await author.draft("teach tawhid")
    assert output["lesson"] is None and not output["grounded"]
    assert "Changed original" not in str(output)
    assert len(llm.calls) == 1


async def test_course_skips_source_support_judge():
    llm = FakeLLM(_good_draft())
    calls = judge(llm, "unsupported")
    out = await _agent(llm, {"s1": _approved_source("s1")}).draft("teach tawhid")
    assert out["lesson"] is not None and out["review"] is None and out["attempts"] == 1
    assert len(llm.calls) == 1 and calls == []


async def test_unknown_course_source_never_launders_the_prose():
    draft = _good_draft()
    draft["cards"][0]["sources"].append("unknown")
    llm = FakeLLM(draft)
    out = await _agent(llm, {"s1": _approved_source("s1")}).draft("teach tawhid")
    assert out["lesson"] is None and not out["grounded"]


async def test_review_cache_requires_identical_content_and_original_sources():
    sources = {"s1": _approved_source("s1")}
    llm = FakeLLM()
    reviewer = ReviewAgent(FakeRepo(sources), llm)
    draft = _good_draft()
    first = await reviewer.check(draft, ai=False)
    second = await reviewer.check({**draft, "status": "in_review"}, ai=False)
    assert first["ready_for_reviewer"] and second["checks"]["source_support_reused"]
    assert len(llm.support_calls) == 1
    await reviewer.check({**draft, "summary": {"en": "Edited content", "ar": ""}}, ai=False)
    assert len(llm.support_calls) == 2
    sources["s1"]["text_en"] = "Changed evidence."
    await reviewer.check(draft, ai=False)
    assert len(llm.support_calls) == 3


@pytest.mark.parametrize("boundary", ["approve", "live_edit"])
async def test_manual_publication_skips_automated_support_review(boundary):
    repo = MemoryRepository(FIXTURES)
    llm = FakeLLM()
    calls = judge(llm, "unsupported")
    service = LessonService(repo, ReviewAgent(repo, llm), None, None)
    user = User(id="admin", role="admin")
    if boundary == "approve":
        await service.decide("draft-lesson", "approve", "", user)
        assert repo.lessons["draft-lesson"]["status"] == "published"
    else:
        draft = copy.deepcopy(repo.lessons["wudu-order"])
        draft["summary"]["en"] = "Edited conclusion."
        result = await service.save_draft(draft, user, live=True)
        assert result["issues"] == []
        assert repo.lessons["wudu-order"]["summary"] == draft["summary"]
    assert calls == []


@pytest.mark.parametrize("boundary", ["approve", "live_edit"])
async def test_publication_source_change_before_write_is_rejected_under_repository_check(boundary, monkeypatch):
    repo = MemoryRepository(FIXTURES)
    llm = FakeLLM()
    reviewer = ReviewAgent(repo, llm)
    method = "transition_lesson" if boundary == "approve" else "update_published"
    publish = getattr(repo, method)

    async def change_before_write(*args, **kwargs):
        repo.sources["quran:5:6"]["text_en"] = "Changed before publication."
        return await publish(*args, **kwargs)

    monkeypatch.setattr(repo, method, change_before_write)
    service = LessonService(repo, reviewer, None, None)
    user = User(id="admin", role="admin")
    with pytest.raises(ApiError) as exc:
        if boundary == "approve":
            await service.decide("draft-lesson", "approve", "", user)
        else:
            await service.save_draft(copy.deepcopy(repo.lessons["wudu-order"]), user, live=True)
    assert exc.value.code == "conflict" and not repo.events


async def test_manual_publication_store_outage_has_fixed_error_and_writes_nothing():
    repo = MemoryRepository(FIXTURES)

    async def unavailable(ids):
        raise RuntimeError("private database connection")

    repo.get_sources = unavailable
    service = LessonService(repo, ReviewAgent(repo, FakeLLM()), None, None)
    with pytest.raises(ApiError) as exc:
        await service.decide("draft-lesson", "approve", "", User(id="admin", role="admin"))
    assert exc.value.code == "source_support_unavailable" and not repo.events
    assert "private" not in str(exc.value)


async def test_locked_postgres_snapshot_preserves_core_and_original_extra():
    from app.repositories.postgres_repository import PostgresRepository

    original = _approved_source("s1")
    row = {
        **original,
        "updated_at": "administrative timestamp",
        "extra": {"explanation_ar": "شرح أصلي", "review_status": "pending"},
    }
    snapshot = PostgresRepository._source_snapshot([row])
    assert snapshot["s1"]["review_status"] == "approved"
    assert snapshot["s1"]["explanation_ar"] == "شرح أصلي"
    assert "updated_at" not in snapshot["s1"]


@pytest.mark.parametrize("boundary", ["approve", "live_edit"])
async def test_postgres_publication_locks_full_source_snapshot_and_rejects_changes(boundary):
    from contextlib import nullcontext
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from app.repositories.postgres_repository import PostgresRepository

    memory = MemoryRepository(FIXTURES)
    lesson = copy.deepcopy(memory.lessons["draft-lesson" if boundary == "approve" else "wudu-order"])
    rows = [memory.sources[sid] for sid in {s for card in lesson["cards"] for s in card.get("sources", [])}]
    conn = SimpleNamespace(
        transaction=lambda: nullcontext(),
        fetch=AsyncMock(return_value=rows),
        fetchrow=AsyncMock(
            return_value={"data": lesson, "status": lesson["status"], "author_id": lesson.get("author_id")}
        ),
        execute=AsyncMock(),
    )
    repo = PostgresRepository(SimpleNamespace(acquire=lambda: nullcontext(conn)))
    repo._curriculum_config = AsyncMock(return_value=await memory.curriculum())
    expected = {row["id"]: {**row, "text_en": "Old evidence."} for row in rows}
    with pytest.raises(ApiError) as exc:
        if boundary == "approve":
            await repo.transition_lesson(lesson["id"], "admin", "approve", reviewer=True, expected_sources=expected)
        else:
            await repo.update_published(lesson, "admin", expected_sources=expected)
    assert exc.value.code == "conflict"
    assert "select * from sources" in conn.fetch.call_args.args[0]
    assert "for share" in conn.fetch.call_args.args[0]
    conn.execute.assert_not_awaited()
