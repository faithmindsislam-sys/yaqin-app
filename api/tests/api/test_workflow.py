import copy

import pytest

from app.http.auth import User, current_user
from app.main import app

AUTHOR = "00000000-0000-0000-0000-000000000001"
OTHER = "00000000-0000-0000-0000-000000000002"


def as_user(role, uid=AUTHOR):
    app.dependency_overrides[current_user] = lambda: User(id=uid, role=role)


def draft():
    return {
        "id": "new-lesson",
        "track": "first-steps",
        "module": "purification",
        "level": "foundation",
        "minutes": 3,
        "title": {"en": "Practice", "ar": "تمرين"},
        "summary": {"en": "A practice lesson", "ar": "درس تطبيقي"},
        "cards": [
            {
                "id": "c1",
                "kind": "concept",
                "title": {"en": "Practice", "ar": "تمرين"},
                "body": {"en": "Start with the face", "ar": "ابدأ بالوجه"},
                "sources": ["quran:5:6"],
            }
        ],
    }


@pytest.mark.parametrize("admin_role", ["admin", "super_admin"])
def test_author_review_publish_workflow_updates_live_content(client, fake_llm, admin_role):
    fake_llm()
    try:
        as_user("teacher")
        assert client.post("/api/review/drafts", json=draft()).status_code == 200
        assert client.get("/api/lessons/new-lesson").status_code == 200
        as_user("teacher", OTHER)
        assert client.get("/api/lessons/new-lesson").status_code == 404
        assert client.post("/api/review/drafts", json=draft()).status_code == 403
        assert client.post("/api/review/new-lesson/submit", json={}).status_code == 403
        as_user("teacher")
        assert client.post("/api/review/new-lesson/submit", json={}).status_code == 200
        assert client.post("/api/review/new-lesson/decision", json={"decision": "approve"}).status_code == 403
        as_user(admin_role, OTHER)
        assert client.post("/api/review/new-lesson/decision", json={"decision": "approve"}).status_code == 200
        body = client.get("/api/content").json()
        assert body["lessons"]["new-lesson"]["status"] == "published"
        assert "new-lesson" in body["tracks"][0]["modules"][0]["lessons"]
        assert client.post("/api/review/drafts", json=draft()).status_code == 403
        assert [e["kind"] for e in app.state.services.repository.events] == ["created", "submit", "approve"]
    finally:
        app.dependency_overrides.clear()


def test_pending_sources_allow_manual_publication_but_never_enter_tutor(client, learner, fake_llm):
    store = app.state.services.repository
    store.sources["quran:5:6"]["review_status"] = "pending"
    store.reload_index()
    fake_llm({"tier": "A", "hostile": False, "search_query": "wudu face arms"})
    body = client.post("/api/tutor/ask", json={"question": "What is wudu?", "lesson_id": "wudu-order"}).json()
    assert "quran:5:6" not in body["sources"]
    result = client.post(
        "/api/tutor/explain-back", json={"lesson_id": "wudu-order", "transcript": "Wash my face"}
    ).json()
    assert result["awaiting_review"] is True and not result["covered"] and not result["sources"]
    try:
        as_user("reviewer")
        fake_llm()
        assert client.post("/api/review/draft-lesson/decision", json={"decision": "approve"}).status_code == 200
        assert app.state.services.repository.lessons["draft-lesson"]["status"] == "published"
        assert store.sources["quran:5:6"]["review_status"] == "pending"
        assert "lesson:draft-lesson:c1" not in store.doc_sources
        assert client.post("/api/review/sources/quran:5:6/approve", json={}).status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_draft_validation_and_unsaved_precheck(client, fake_llm):
    try:
        as_user("instructor")
        bad = draft()
        bad["cards"][0]["sources"] = ["unknown"]
        assert client.post("/api/review/drafts", json=bad).status_code == 400
        bad = draft()
        bad["cards"].append(copy.deepcopy(bad["cards"][0]))
        assert client.post("/api/review/drafts", json=bad).status_code == 400
        bad = draft()
        bad["status"] = "published"
        assert client.post("/api/review/drafts", json=bad).json()["status"] == "draft"
        assert app.state.services.repository.lessons["new-lesson"]["status"] == "draft"
        fake_llm()
        assert client.post("/api/review/check", json=draft()).status_code == 200
        assert [e["kind"] for e in app.state.services.repository.events] == [
            "created"
        ]  # the pre-check itself records nothing
        assert client.post("/api/review/check", json={"lesson": draft()}).status_code == 400
        assert client.post("/api/review/sources/quran:5:6/approve", json={}).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_learner_bundle_hides_drafts(client, learner):
    r = client.get("/api/content")
    assert r.headers["cache-control"] == "no-store"
    assert "draft-lesson" not in r.json()["lessons"]


def test_production_requires_persistent_storage(client, monkeypatch):
    import asyncio

    import pytest

    from app.configuration.settings import get_settings
    from app.container import create_repository

    monkeypatch.setenv("ENV", "prod")
    monkeypatch.setenv("DATABASE_URL", "")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="Production requires"):
        asyncio.run(create_repository(get_settings()))
