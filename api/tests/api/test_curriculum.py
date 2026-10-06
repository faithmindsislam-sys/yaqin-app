from copy import deepcopy

import pytest

from app.domain.users import User
from app.http.auth import current_user
from app.main import app

ADMIN = "00000000-0000-0000-0000-000000000001"
BI = {"en": "New title", "ar": "عنوان جديد"}


@pytest.fixture
def admin(client):
    app.dependency_overrides[current_user] = lambda: User(id=ADMIN, role="admin")
    yield client
    app.dependency_overrides.clear()


def save(client, config, key, items, track=None):
    path = f"/api/curriculum/tracks/{track}" if track else f"/api/curriculum/{key}"
    return client.post(path, json={"updated_at": config["updated_at"][key], "modules" if track else key: items})


@pytest.mark.parametrize("role", ["learner", "teacher"])
def test_non_admin_cannot_read_or_write(client, role):
    app.dependency_overrides[current_user] = lambda: User(id=ADMIN, role=role)
    try:
        assert client.get("/api/curriculum").status_code == 403
        for endpoint, key in [("subjects", "subjects"), ("levels", "levels"), ("tracks/explore", "modules")]:
            assert client.post(f"/api/curriculum/{endpoint}", json={"updated_at": None, key: []}).status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_super_admin_and_public_dynamic_content(admin):
    app.dependency_overrides[current_user] = lambda: User(id=ADMIN, role="super_admin")
    config = admin.get("/api/curriculum").json()
    assert all(s["levels"] == [1, 2, 3, 4] for s in config["subjects"])
    added = {"id": "new-title", "title": BI, "levels": [1, 2]}
    config = save(admin, config, "subjects", [*config["subjects"], added]).json()
    config["subjects"][-1]["title"] = {"en": "Renamed title", "ar": "عنوان معدّل"}
    assert save(admin, config, "subjects", config["subjects"]).status_code == 200
    public = admin.get("/api/content").json()
    assert public["subjects"][-1]["id"] == "new-title"
    assert public["subjects"][-1]["title"]["en"] == "Renamed title"
    assert public["levels"] == config["levels"]
    assert app.state.services.repository.admin_events[-1]["kind"] == "curriculum_saved"


@pytest.mark.parametrize("key", ["subjects", "levels", "tracks"])
def test_stale_saves_are_atomic_conflicts(admin, key):
    config = admin.get("/api/curriculum").json()
    items = config[key] if key != "tracks" else config["tracks"][0]["modules"]
    track = config["tracks"][0]["id"] if key == "tracks" else None
    assert save(admin, config, key, items, track).status_code == 200
    store = app.state.services.repository
    before = deepcopy(store.lessons)
    audit = deepcopy(store.admin_events)
    response = save(admin, config, key, items, track)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "stale_curriculum"
    assert store.lessons == before and store.admin_events == audit


@pytest.mark.parametrize("key", ["subjects", "levels", "tracks"])
def test_delete_blocked_while_in_use(admin, key):
    config = admin.get("/api/curriculum").json()
    course = config["courses"][0]
    track = None
    if key == "subjects":
        items = [s for s in config[key] if s["id"] != course["subject"]]
    elif key == "levels":
        from app.domain.courses import lesson_level
        items = [l for l in config[key] if l["id"] != lesson_level(course["level"])]
    else:
        chosen = next(t for t in config["tracks"] if any(m["lessons"] for m in t["modules"]))
        track = chosen["id"]
        items = []
    store = app.state.services.repository
    before = deepcopy(store.lessons)
    assert save(admin, config, key, items, track).status_code == 409
    assert store.lessons == before and not store.admin_events


def test_unused_subject_and_level_delete_and_subject_level_cleanup(admin):
    config = admin.get("/api/curriculum").json()
    config = save(admin, config, "levels", [*config["levels"], {"id": 5, "title": BI}]).json()
    subject = {"id": "new-title", "title": BI, "levels": [1, 5]}
    config = save(admin, config, "subjects", [*config["subjects"], subject]).json()
    previous_subject_revision = config["updated_at"]["subjects"]
    config = save(admin, config, "levels", [l for l in config["levels"] if l["id"] != 5]).json()
    assert config["subjects"][-1]["levels"] == [1]
    assert config["updated_at"]["subjects"] != previous_subject_revision
    assert save(admin, config, "subjects", config["subjects"][:-1]).status_code == 200


def test_subject_offered_levels_and_new_classification(admin):
    config = admin.get("/api/curriculum").json()
    fiqh = next(s for s in config["subjects"] if s["id"] == "fiqh")
    subjects = [{**s, "levels": []} if s["id"] == fiqh["id"] else s for s in config["subjects"]]
    assert save(admin, config, "subjects", subjects).status_code == 409
    config = save(admin, config, "levels", [*config["levels"], {"id": 5, "title": BI}]).json()
    config = save(admin, config, "subjects", [*config["subjects"], {"id": "new-title", "title": BI, "levels": [5]}]).json()
    draft = {**deepcopy(app.state.services.repository.lessons["wudu-order"]), "id": "dynamic-course", "subject": "new-title", "level": 1, "status": "draft"}
    assert admin.post("/api/review/drafts", json=draft).status_code == 400
    draft["level"] = 5
    assert admin.post("/api/review/drafts", json=draft).status_code == 200
    draft["level"] = 6
    assert admin.post("/api/review/drafts", json=draft).status_code == 400


def test_track_membership_order_and_course_content_preserved_and_legacy_planned_dropped(admin):
    store = app.state.services.repository
    before = deepcopy(store.lessons)
    store.progress[(ADMIN, "wudu-order")] = {"card": 2, "note": "keep"}
    progress = deepcopy(store.progress)
    config = admin.get("/api/curriculum").json()
    track = next(t for t in config["tracks"] if t["id"] == "first-steps")
    modules = deepcopy(track["modules"])
    for module in modules:
        module["lessons"] = [cid for cid in module["lessons"] if cid != "wudu-order"]
    modules.append({"id": "extra", "title": BI, "lessons": ["wudu-order"], "planned": [BI]})
    config = save(admin, config, "tracks", modules, "first-steps").json()
    assert store.lessons["wudu-order"]["tracks"] == ["first-steps"]
    # An older page may still send static Coming soon titles: accepted, never stored.
    assert all("planned" not in m for t in config["tracks"] for m in t["modules"])
    # Move between sections, reorder sections and rename.
    modules[-1]["lessons"] = []
    modules[0]["lessons"].append("wudu-order")
    modules[-1]["title"] = {"en": "Renamed", "ar": "معدّل"}
    config = save(admin, config, "tracks", modules[::-1], "first-steps").json()
    assert store.lessons["wudu-order"]["tracks"] == ["first-steps"]
    for cid in before:
        assert {k: v for k, v in store.lessons[cid].items() if k != "tracks"} == {k: v for k, v in before[cid].items() if k != "tracks"}
    assert store.progress == progress
    # Curriculum cannot add the course to a second journey.
    other = next(t for t in config["tracks"] if t["id"] == "explore")
    shared = deepcopy(other["modules"])
    shared[0]["lessons"].append("wudu-order")
    assert save(admin, config, "tracks", shared, "explore").status_code == 409
    assert store.lessons == before and store.progress == progress
    # Now removing its only track is blocked, without affecting any other membership.
    track = next(t for t in config["tracks"] if t["id"] == "first-steps")
    modules = [{**m, "lessons": [i for i in m["lessons"] if i != "wudu-order"]} for m in track["modules"]]
    assert save(admin, config, "tracks", modules, "first-steps").status_code == 409


@pytest.mark.parametrize("kind", ["unknown-track", "duplicate-course", "missing-course", "duplicate-section", "bad-slug", "bad-level", "duplicate-level", "next-level", "renamed-track"])
def test_invalid_curriculum_lists_rejected(admin, kind):
    config = admin.get("/api/curriculum").json()
    modules = deepcopy(config["tracks"][0]["modules"])
    if kind == "unknown-track":
        response = save(admin, config, "tracks", modules, "custom")
    elif kind in ("duplicate-course", "missing-course", "duplicate-section"):
        if kind == "duplicate-course": modules[0]["lessons"].append(modules[0]["lessons"][0])
        elif kind == "missing-course": modules[0]["lessons"].append("missing")
        else: modules.append(deepcopy(modules[0]))
        response = save(admin, config, "tracks", modules, config["tracks"][0]["id"])
    elif kind == "renamed-track":
        response = admin.post("/api/curriculum/tracks/explore", json={"updated_at": None, "modules": modules, "title": BI})
    elif kind == "next-level":
        response = save(admin, config, "levels", [*config["levels"], {"id": 6, "title": BI}])
    elif kind == "duplicate-level":
        response = save(admin, config, "levels", [*config["levels"], config["levels"][0]])
    else:
        subject = {"id": "wrong" if kind == "bad-slug" else "new-title", "title": BI, "levels": [999] if kind == "bad-level" else [1]}
        response = save(admin, config, "subjects", [*config["subjects"], subject])
    assert response.status_code in (400, 404)


def test_course_saves_invalidate_track_revision(admin):
    config = admin.get("/api/curriculum").json()
    draft = {**deepcopy(app.state.services.repository.lessons["wudu-order"]), "id": "another-draft", "status": "draft", "tracks": ["explore"]}
    assert admin.post("/api/review/drafts", json=draft).status_code == 200
    assert save(admin, config, "tracks", config["tracks"][1]["modules"], "explore").status_code == 409
    assert "another-draft" in [i for m in store_tracks(admin, "explore") for i in m["lessons"]]


def store_tracks(client, track_id):
    return next(t["modules"] for t in client.get("/api/curriculum").json()["tracks"] if t["id"] == track_id)


def test_module_goal_and_replacement_preserve_subject_difficulty_and_progress(admin):
    config = admin.get("/api/curriculum").json()
    track = next(t for t in config["tracks"] if t["id"] == "explore")
    store = app.state.services.repository
    before = deepcopy(store.lessons)
    store.progress[(ADMIN, "who-is-god")] = {"card": 2, "quizScore": 1}
    progress = deepcopy(store.progress)
    ids = [cid for module in track["modules"] for cid in module["lessons"]]
    modules = [{"id": "new-module", "title": BI, "goal": BI, "lessons": ids}]
    response = save(admin, config, "tracks", modules, "explore")
    assert response.status_code == 200
    saved = next(t for t in response.json()["tracks"] if t["id"] == "explore")
    assert saved["modules"] == modules
    assert store.lessons == before and store.progress == progress
    modules[0]["goal"]["en"] = " "
    assert save(admin, response.json(), "tracks", modules, "explore").status_code == 400
