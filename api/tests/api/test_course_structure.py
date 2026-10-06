import copy

import pytest

from app.domain.courses import migrate_course, place_course
from app.http.auth import current_user
from app.domain.users import User
from app.main import app

AUTHOR = "00000000-0000-0000-0000-000000000001"


def test_metadata_migration_preserves_content_ids_levels_and_membership(client):
    store = app.state.services.repository
    before = copy.deepcopy(store.lessons["wudu-order"])
    old = {**before, "track": "first-steps", "module": "purification", "tags": ["old"]}
    old.pop("tracks")
    old.pop("subject")
    old["level"] = "deeper"
    old["status"] = "draft"
    old["author_id"] = AUTHOR
    migrated = migrate_course(old, store.tracks)
    assert migrated["tracks"] == ["first-steps"]
    assert migrated["subject"] == "fiqh" and migrated["level"] == "deeper"
    for key in ("id", "title", "summary", "cards", "quiz", "explain_back", "status", "author_id"):
        assert migrated.get(key) == old.get(key)
    assert not {"track", "module", "tags"} & migrated.keys()
    assert migrate_course(migrated, store.tracks) == migrated


def test_single_journey_reclassification_preserves_progress_and_history(client, fake_llm):
    store = app.state.services.repository
    store.tracks.append({"id": "deepen", "title": {"en": "Deepen My Knowledge", "ar": "أعمّق معرفتي"}, "modules": [{"id": "recite", "title": {"en": "Recite", "ar": "التلاوة"}, "lessons": []}]})
    draft = {**copy.deepcopy(store.lessons["wudu-order"]), "id": "shared-course", "status": "draft", "subject": "fiqh",
             "tracks": ["first-steps"], "level": 3}
    app.dependency_overrides[current_user] = lambda: User(id=AUTHOR, role="admin")
    fake_llm()
    try:
        assert client.post("/api/review/drafts", json=draft).status_code == 200
        assert client.post("/api/review/shared-course/submit").status_code == 200
        assert client.post("/api/review/shared-course/decision", json={"decision": "approve"}).status_code == 200
        bundle = client.get("/api/content").json()
        assert list(bundle["courses"]).count("shared-course") == 1
        for tid in draft["tracks"]:
            track = next(t for t in bundle["tracks"] if t["id"] == tid)
            assert [cid for m in track["modules"] for cid in m["lessons"]].count("shared-course") == 1
        saved = copy.deepcopy(store.lessons["shared-course"])
        store.progress[(AUTHOR, "shared-course")] = {"card": 1, "quiz_score": 1, "completed_at": "2026-10-04", "note": "keep"}
        progress = copy.deepcopy(store.progress)
        history = client.get("/api/review/shared-course/history").json()
        assert client.get("/api/courses/shared-course").json() == client.get("/api/lessons/shared-course").json()
        assert client.post("/api/review/shared-course/unpublish").status_code == 200
        draft["tracks"] = ["deepen"]
        assert client.post("/api/review/drafts", json=draft).status_code == 200
        assert client.post("/api/review/shared-course/submit").status_code == 200
        assert client.post("/api/review/shared-course/decision", json={"decision": "approve"}).status_code == 200
        assert store.progress == progress
        for key in ("id", "cards", "quiz", "explain_back", "level"):
            assert store.lessons["shared-course"].get(key) == saved.get(key)
        assert all(e in client.get("/api/review/shared-course/history").json() for e in history)
        for _ in range(2):
            place_course(store.tracks, store.lessons["shared-course"])
        for track in store.tracks:
            assert [cid for m in track["modules"] for cid in m["lessons"]].count("shared-course") == int(track["id"] in draft["tracks"])
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("patch", [{"subject": "missing"}, {"tracks": []}, {"tracks": ["deepen", "deepen"]},
                                   {"tracks": ["first-steps", "explore"]},
                                   {"tracks": ["missing"]}, {"tags": ["forbidden"]}, {"module": "purification"}])
def test_course_classification_is_validated(client, patch):
    draft = {**copy.deepcopy(app.state.services.repository.lessons["wudu-order"]), "id": "test-course", "status": "draft"}
    app.dependency_overrides[current_user] = lambda: User(id=AUTHOR, role="teacher")
    try:
        assert client.post("/api/review/drafts", json={**draft, **patch}).status_code == 400
    finally:
        app.dependency_overrides.clear()
