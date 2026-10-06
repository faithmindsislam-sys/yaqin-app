"""Studio 'Generate with AI' runs as a background job with pollable status, and a finished
draft is saved as a draft lesson owned by the teacher who asked for it."""

import time

import pytest

from app.http.auth import User, current_user
from app.main import app

AUTHOR = "00000000-0000-0000-0000-000000000001"
OTHER = "00000000-0000-0000-0000-000000000002"


@pytest.fixture
def actor():
    def set_actor(role="teacher", uid=AUTHOR):
        app.dependency_overrides[current_user] = lambda: User(id=uid, role=role)

    yield set_actor
    app.dependency_overrides.clear()


def _lesson():
    bi = lambda s: {"en": s, "ar": s}  # noqa: E731
    return {
        "title": bi("Wudu basics"), "summary": bi("How to wash before prayer."),
        "cards": [
            {"id": "c1", "kind": "concept", "title": bi("Wash"), "body": bi("Wash your face."),
             "sources": ["quran:5:6"]},
            {"id": "c2", "kind": "check", "title": bi("Reflect"), "body": bi("Which part comes first?")},
        ],
    }


@pytest.fixture
def fake_author(monkeypatch):
    """Replace the course agent so no model is called; reports progress like the real one."""
    def install(result):
        async def draft(prompt, *, lang="en", track=None, progress=None, resume=None, checkpoint=None):
            if progress:
                await progress("sources", 0)
                await progress("writing", 1)
            return result
        monkeypatch.setattr(app.state.services.lessons.author, "draft", draft)
    return install


def _wait(client, job_id, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        body = client.get(f"/api/review/draft/{job_id}").json()
        if body["status"] != "running":
            return body
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_draft_job_runs_in_background_and_saves_lesson(client, actor, fake_author):
    actor("teacher", AUTHOR)
    fake_author({"lesson": _lesson(), "review": {"ready_for_reviewer": True, "issues": []}, "grounded": True})

    start = client.post("/api/review/draft", json={"prompt": "teach wudu"})
    assert start.status_code == 202
    job_id = start.json()["job_id"]

    done = _wait(client, job_id)
    assert done["status"] == "done"
    assert done["stage"] == "done"
    assert done["lesson_id"]
    # the card without a source is dropped (the lesson schema requires a citation per card)
    assert [c["id"] for c in done["lesson"]["cards"]] == ["c1"]

    # it now appears in the teacher's Studio lessons as a draft they own
    mine = {lesson["id"]: lesson for lesson in client.get("/api/review/lessons").json()}
    assert done["lesson_id"] in mine
    assert mine[done["lesson_id"]]["status"] == "draft"
    assert mine[done["lesson_id"]]["author_id"] == AUTHOR


def test_other_teachers_cannot_read_the_job(client, actor, fake_author):
    actor("teacher", AUTHOR)
    fake_author({"lesson": _lesson(), "review": None, "grounded": True})
    job_id = client.post("/api/review/draft", json={"prompt": "teach wudu"}).json()["job_id"]
    _wait(client, job_id)

    actor("teacher", OTHER)
    assert client.get(f"/api/review/draft/{job_id}").status_code == 404
    actor("admin", OTHER)
    assert client.get(f"/api/review/draft/{job_id}").status_code == 200


def test_no_sources_ends_with_reason_and_no_lesson(client, actor, fake_author):
    actor("teacher", AUTHOR)
    fake_author({"lesson": None, "review": None, "grounded": False,
                 "reason_code": "no_sources", "reason": "no approved sources matched this topic"})
    job_id = client.post("/api/review/draft", json={"prompt": "quantum physics"}).json()["job_id"]
    done = _wait(client, job_id)
    assert done["status"] == "no_sources"
    assert done["lesson"] is None and done["lesson_id"] is None
    assert "No approved sources" in done["reason"]


def test_agent_crash_marks_job_failed(client, actor, monkeypatch):
    actor("teacher", AUTHOR)

    async def boom(prompt, *, lang="en", track=None, progress=None, resume=None, checkpoint=None):
        raise RuntimeError("model exploded")
    monkeypatch.setattr(app.state.services.lessons.author, "draft", boom)

    job_id = client.post("/api/review/draft", json={"prompt": "teach wudu"}).json()["job_id"]
    done = _wait(client, job_id)
    assert done["status"] == "failed"
    assert "model exploded" not in done["reason"]
    assert done["reason_code"] == "generation_failed"


def test_learners_cannot_start_jobs(client, actor):
    actor("learner", AUTHOR)
    assert client.post("/api/review/draft", json={"prompt": "x"}).status_code == 403



def test_ai_job_saves_without_support_or_editorial_review(client, actor, monkeypatch):
    from app.agents.course.agent import CourseAgent
    from app.domain.search import Retrieved
    from tests.agents.test_course_agent import FakeLLM, FakeRetrieval, _approved_source, _good_draft
    from tests.api.test_source_support import judge

    actor("teacher", AUTHOR)
    repo = app.state.services.repository
    sources = {"s1": _approved_source("s1")}
    repo.sources.update(sources)
    llm = FakeLLM(_good_draft(), RuntimeError("editorial review must not run"))
    support_calls = judge(llm, "unsupported")
    author = CourseAgent(repo, llm, FakeRetrieval(Retrieved(sources, {})))
    monkeypatch.setattr(app.state.services.lessons, "author", author)
    job_id = client.post("/api/review/draft", json={"prompt": "teach tawhid"}).json()["job_id"]
    done = _wait(client, job_id)
    assert done["status"] == "done" and done["execution"] == 1
    assert done["lesson"]["cards"] and done["review"] is None
    assert not done["resumable"] and support_calls == []
    assert len(llm.calls) == 1 and len(llm.outputs) == 1
    assert client.post(f"/api/review/draft/{job_id}/resume").json()["status"] == "done"
    assert len(llm.calls) == 1


def test_interrupted_checkpoint_respects_owner_max_executions_and_cumulative_budget(client, actor, monkeypatch):
    from app.domain.operations import CURRENT
    seen = []
    async def interrupted(prompt, *, lang, track, progress, resume, checkpoint):
        budget = CURRENT.get()
        seen.append((resume, budget.model_calls))
        await checkpoint({"server_generated": "stored result"})
        await progress("writing", 1)
        budget.reserve({"prompt": prompt}, 8000)
        raise RuntimeError("interrupted")
    monkeypatch.setattr(app.state.services.lessons.author, "draft", interrupted)
    actor("teacher", AUTHOR)
    job_id = client.post("/api/review/draft", json={"prompt": "topic"}).json()["job_id"]
    _wait(client, job_id)
    actor("teacher", OTHER)
    assert client.post(f"/api/review/draft/{job_id}/resume").status_code == 404
    actor("admin", OTHER)
    assert client.post(f"/api/review/draft/{job_id}/resume").status_code == 404
    actor("teacher", AUTHOR)
    for _ in range(2):
        assert client.post(f"/api/review/draft/{job_id}/resume").status_code == 202
        _wait(client, job_id)
    assert [usage for _, usage in seen] == [0, 1, 2]
    assert all(state == {"server_generated": "stored result"} for state, _ in seen[1:])
    assert not client.get(f"/api/review/draft/{job_id}").json()["resumable"]
    assert client.post(f"/api/review/draft/{job_id}/resume").status_code == 409


@pytest.mark.parametrize("code", ["source_support_rejected", "source_changed", "safety_blocked", "safety_unavailable"])
def test_terminal_rejection_cannot_resume_private_checkpoint(client, actor, monkeypatch, code):
    actor("teacher", AUTHOR)
    async def rejected(prompt, *, lang, track, progress, resume, checkpoint):
        await checkpoint({"lesson": _lesson()})
        return {"lesson": None, "review": None, "reason_code": code}
    monkeypatch.setattr(app.state.services.lessons.author, "draft", rejected)
    job_id = client.post("/api/review/draft", json={"prompt": "topic"}).json()["job_id"]
    assert not _wait(client, job_id)["resumable"]
    assert client.post(f"/api/review/draft/{job_id}/resume").status_code == 409
    assert "_checkpoint" not in app.state.services.repository.draft_jobs[job_id]["result"]


async def test_resume_claim_and_execution_fence_are_atomic(client):
    import asyncio
    from app.domain.errors import ApiError
    repo = app.state.services.repository
    job = await repo.create_draft_job(AUTHOR, "topic", "en")
    await repo.update_draft_job(job["id"], result={"_execution_token": "old"}, status="failed")
    failed = await repo.get_draft_job(job["id"])
    claims = await asyncio.gather(*[repo.claim_draft_job(job["id"], AUTHOR, failed["updated_at"],
                                  {"_execution_token": "new"}) for _ in range(2)])
    assert sum(claims) == 1
    assert not await repo.update_draft_job(job["id"], expected_token="old", status="failed")
    with pytest.raises(ApiError):
        await repo.save_draft({"id": "late-worker"}, AUTHOR, False, job_id=job["id"], job_token="old")
    assert "late-worker" not in repo.lessons


async def test_expiry_uses_current_execution_start_and_keeps_inflight_reservation(client):
    from datetime import datetime, timedelta, timezone
    repo = app.state.services.repository
    job = await repo.create_draft_job(AUTHOR, "topic", "en")
    row = repo.draft_jobs[job["id"]]
    row["created_at"] = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    row["result"] = {"_started_at": datetime.now(timezone.utc).isoformat(), "_budget": {"calls": 4, "tokens": 800000}}
    await repo.expire_draft_jobs(510)
    assert row["status"] == "running"
    row["result"]["_started_at"] = row["created_at"]
    await repo.expire_draft_jobs(510)
    assert row["status"] == "failed"
    assert row["result"]["_budget"] == {"calls": 4, "tokens": 800000}
