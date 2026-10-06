"""Exercise validated requests through role prompts and persisted Studio jobs, offline."""
from contextlib import nullcontext
from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.agents.course import agent as course_module
from app.agents.review import agent as review_module
from app.agents.tutor import agent as tutor_module
from app.domain.audience import audience_instructions, course_audience
from app.domain.users import User
from app.gateways.agent_gateway import AgentUnavailable
from app.http.auth import current_user
from app.main import app
from app.repositories.postgres_repository import PostgresRepository
from tests.agents.test_course_agent import FakeLLM, FakeRepo, _agent, _approved_source, _good_draft

TRACKS = ["explore", "first-steps", "deepen", None]
ROUTE = {"tier": "A", "hostile": False, "search_query": "wudu face arms"}
ANSWER = {"answer": "Wash the face. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": []}


@pytest.mark.usefixtures("learner")
@pytest.mark.parametrize("track", TRACKS)
@pytest.mark.parametrize("lang", ["en", "ar"])
def test_tutor_and_explain_use_selected_system_context(client, fake_llm, monkeypatch, track, lang):
    calls = []
    def context(value):
        calls.append(value)
        return "server-selected-context"
    monkeypatch.setattr(tutor_module, "audience_instructions", context)
    fake = fake_llm(ROUTE, ANSWER)
    response = client.post("/api/tutor/ask", json={"question": "What are the parts of wudu?",
        "course_id": "wudu-order", "track": track, "lang": lang})
    assert response.status_code == 200 and response.json()["sources"]
    assert calls == [track]
    assert "server-selected-context" in fake.calls[-1]["system"]
    assert "server-selected-context" not in str(fake.calls[-1]["messages"])
    calls.clear()
    fake = fake_llm({"covered": [], "misconceptions": [], "feedback": "Try again."})
    response = client.post("/api/tutor/explain-back", json={"course_id": "wudu-order",
        "transcript": "Wash the face", "track": track, "lang": lang})
    assert response.status_code == 200 and response.json()["ai_generated"]
    assert calls == [track] and "server-selected-context" in fake.calls[0]["system"]


@pytest.mark.usefixtures("learner")
@pytest.mark.parametrize("track", TRACKS)
def test_remote_payload_and_local_fallback_keep_explicit_track(client, fake_llm, monkeypatch, track):
    remote = SimpleNamespace(enabled=True, ask=AsyncMock(side_effect=AgentUnavailable("offline")))
    monkeypatch.setattr(app.state.services.tutor, "agent", remote)
    selected = []
    monkeypatch.setattr(tutor_module, "audience_instructions", lambda value: selected.append(value) or "audience")
    fake_llm(ROUTE, ANSWER)
    response = client.post("/api/tutor/ask", json={"question": "What are the parts of wudu?",
        "track": track}, headers={"Authorization": "Bearer learner-jwt"})
    assert response.status_code == 200 and response.json()["sources"]
    assert remote.ask.call_args.args[0]["track"] == track
    assert remote.ask.call_args.kwargs["authorization"] == "Bearer learner-jwt"
    assert selected == [track]


@pytest.mark.usefixtures("learner")
@pytest.mark.parametrize("track", ["unknown", "", [], {"role": "deepen"}, 1])
def test_bad_context_rejected_before_tutor_model(client, fake_llm, track):
    fake = fake_llm()
    for endpoint, body in [("ask", {"question": "wudu"}),
                           ("explain-back", {"course_id": "wudu-order", "transcript": "face"})]:
        assert client.post("/api/tutor/" + endpoint, json={**body, "track": track}).status_code == 400
    assert fake.calls == []


@pytest.mark.parametrize("track", TRACKS)
async def test_course_writing_gets_selected_context_without_review(monkeypatch, track):
    seen = []
    def context(value):
        seen.append(value)
        return "selected-course-audience"
    monkeypatch.setattr(course_module, "audience_instructions", context)
    draft = {**_good_draft(), "subject": "aqidah", "level": 4, "tracks": ["explore", "deepen"]}
    llm = FakeLLM(draft)
    output = await _agent(llm, {"s1": _approved_source("s1")}).draft("teach tawhid", track=track, lang="ar")
    course = output["lesson"]
    assert course["subject"] == "aqidah" and course["level"] == 4
    assert course["tracks"] == [track or "explore"]
    assert course["audience_track"] == (track or "mixed")
    assert seen == [track, track]  # direct-call validation and writer
    assert len(llm.calls) == 1 and output["review"] is None
    assert all("selected-course-audience" in call["system"] for call in llm.calls)
    assert set(llm.calls[0]["schema"]["properties"]["title"]["properties"]) == {"en", "ar"}  # bilingual schema remains intact


@pytest.mark.parametrize("track", TRACKS)
def test_studio_http_job_retains_context_for_runner_and_saved_course(client, monkeypatch, track):
    user = User(id="00000000-0000-0000-0000-000000000001", role="teacher")
    app.dependency_overrides[current_user] = lambda: user
    service = app.state.services.lessons
    app.state.services.repository.tracks.append({"id": "deepen", "title": {"en": "Deepen", "ar": "تعمّق"}, "modules": []})
    seen = []
    async def draft(prompt, *, lang, track, progress, resume=None, checkpoint=None):
        seen.append(track)
        course = deepcopy(app.state.services.repository.lessons["wudu-order"])
        course["audience_track"] = track or "mixed"
        return {"lesson": course, "review": {"issues": []}, "grounded": True}
    monkeypatch.setattr(service.author, "draft", draft)
    try:
        request = {"prompt": "Teach wudu", "lang": "ar"}
        if track is not None:
            request["track"] = track
        start = client.post("/api/review/draft", json=request)
        assert start.status_code == 202
        job_id = start.json()["job_id"]
        for _ in range(100):
            result = client.get("/api/review/draft/" + job_id).json()
            if result["status"] != "running":
                break
            import time
            time.sleep(0.01)
        assert result["status"] == "done", result
        assert seen == [track] and result["track"] == track
        assert result["lesson"]["tracks"] == [track or "first-steps"]
        assert result["lesson"]["audience_track"] == (track or "first-steps")
        saved = client.get("/api/courses/" + result["lesson_id"]).json()
        assert saved["audience_track"] == (track or "first-steps")
        job = app.state.services.repository.draft_jobs[job_id]
        assert job["result"]["track"] == track
    finally:
        app.dependency_overrides.pop(current_user, None)


def test_studio_invalid_context_rejected(client):
    app.dependency_overrides[current_user] = lambda: User(id="00000000-0000-0000-0000-000000000001", role="teacher")
    try:
        for value in ["unknown", [], 1]:
            assert client.post("/api/review/draft", json={"prompt": "x", "track": value}).status_code == 400
        assert not app.state.services.repository.draft_jobs
    finally:
        app.dependency_overrides.pop(current_user, None)


async def test_postgres_job_persists_audience_in_existing_json():
    now = datetime.now(timezone.utc)
    row = {"id": uuid4(), "author_id": None, "prompt": "topic", "lang": "en",
           "result": {"track": "deepen"}, "created_at": now, "updated_at": now}
    conn = SimpleNamespace(fetchrow=AsyncMock(return_value=row))
    store = PostgresRepository(SimpleNamespace(acquire=lambda: nullcontext(conn)))
    job = await store.create_draft_job(None, "topic", "en", track="deepen")
    assert conn.fetchrow.call_args.args[-1] == {"track": "deepen", "_seconds": 480}
    restored = await store.get_draft_job(job["id"])
    assert restored["result"]["track"] == "deepen"


def test_legacy_multi_track_and_unknown_do_not_choose_conversion_audience():
    assert course_audience({"tracks": ["deepen", "explore"]}) is None
    assert course_audience({"tracks": ["deepen"], "audience_track": "mixed"}) is None
    assert course_audience({"tracks": ["explore", "deepen"], "audience_track": "deepen"}) == "deepen"
    assert course_audience({"tracks": ["first-steps"]}) == "first-steps"
    assert len({audience_instructions(track) for track in TRACKS}) == 4
    for invalid in ["unknown", [], {}]:
        with pytest.raises(ValueError):
            audience_instructions(invalid)

@pytest.mark.usefixtures("learner")
def test_legacy_learner_calls_do_not_infer_track_from_course(client, fake_llm, monkeypatch):
    selected = []
    monkeypatch.setattr(tutor_module, "audience_instructions", lambda track: selected.append(track) or "legacy-context")
    fake_llm(ROUTE, ANSWER)
    assert client.post("/api/tutor/ask", json={"question": "What are the parts of wudu?",
        "course_id": "wudu-order"}).status_code == 200
    fake_llm({"covered": [], "misconceptions": [], "feedback": "Try again."})
    assert client.post("/api/tutor/explain-back", json={"course_id": "wudu-order",
        "transcript": "face"}).status_code == 200
    assert selected == [None, None]

async def test_review_cache_does_not_reuse_a_different_audience():
    draft = {**_good_draft(), "tracks": ["explore", "deepen"], "audience_track": "explore"}
    llm = FakeLLM({"issues": []}, {"issues": []})
    reviewer = review_module.ReviewAgent(FakeRepo({"s1": _approved_source("s1")}), llm)
    await reviewer.check(draft)
    await reviewer.check({**draft, "audience_track": "deepen"})
    assert len(llm.calls) == 2
    assert llm.calls[0]["system"] != llm.calls[1]["system"]
