import pytest


def test_health(client):
    body = client.get("/api/health").json()
    assert body == {"ok": True, "model": None, "db": True, "store": "memory"}


def test_tracks_list_only_published(client, learner):
    tracks = client.get("/api/tracks").json()
    lessons = tracks[0]["modules"][0]["lessons"]
    assert [lesson["id"] for lesson in lessons] == ["wudu-order"]
    assert lessons[0]["cards"] == 2


def test_lesson_resolves_sources(client, learner):
    body = client.get("/api/lessons/wudu-order").json()
    assert body["sources_by_id"]["quran:5:6"]["ref_en"] == "Al-Ma'idah 5:6"


def test_unpublished_lesson_hidden_from_learners(client, learner):
    r = client.get("/api/lessons/draft-lesson")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_validation_error_envelope(client, learner):
    r = client.post("/api/tutor/ask", json={"question": ""})
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_request"


def test_review_requires_sign_in(client):
    r = client.get("/api/review/queue")
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"


def test_bad_token_rejected(client):
    r = client.get("/api/review/queue", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


def test_rate_limit(client, learner, monkeypatch, fake_llm):
    from app.configuration.settings import get_settings

    monkeypatch.setenv("TUTOR_RATE_PER_MINUTE", "2")
    get_settings.cache_clear()
    fake_llm()
    codes = [client.post("/api/tutor/ask", json={"question": "hi"}).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


@pytest.fixture
def reviewer(client):
    from app.domain.users import User
    from app.http.auth import current_user
    from app.main import app

    app.dependency_overrides[current_user] = lambda: User(id="reviewer", role="reviewer")
    yield
    app.dependency_overrides.pop(current_user, None)


def test_review_queue_and_decision(client, reviewer, fake_llm):
    fake_llm()
    assert [lesson["id"] for lesson in client.get("/api/review/queue").json()] == ["draft-lesson"]
    r = client.post("/api/review/draft-lesson/decision", json={"decision": "approve", "note": "ok"})
    assert r.json() == {"lesson_id": "draft-lesson", "status": "published"}
    assert client.get("/api/review/queue").json() == []


def test_review_check_flags_unsourced_scripture_and_unknown_ids(client, reviewer, fake_llm):
    fake_llm()  # model unavailable: rule checks still run
    draft = {
        "id": "new",
        "track": "first-steps",
        "module": "x",
        "cards": [
            {
                "id": "c1",
                "kind": "concept",
                "sources": ["quran:5:6", "hadith:fake:1"],
                "body": {"ar": "قَالَ رَسُولُ ٱللَّهِ إِنَّمَا ٱلْأَعْمَالُ بِٱلنِّيَّاتِ وَإِنَّمَا لِكُلِّ ٱمْرِئٍ", "en": "x"},
            },
            {"id": "c2", "kind": "quote", "sources": []},
        ],
    }
    body = client.post("/api/review/check", json=draft).json()
    issues = {(i["card"], i["issue"].split(" ")[0]) for i in body["issues"]}
    assert body["ready_for_reviewer"] is False
    assert ("c1", "Cites") in issues
    assert any("vowelled Arabic" in i["issue"] for i in body["issues"])
    assert any(i["card"] == "c2" and "Quote card" in i["issue"] for i in body["issues"])
    assert body["checks"]["ai_review"] is False


def test_denied_aws_profile_raises(monkeypatch):
    from app.configuration.settings import get_settings

    monkeypatch.setenv("YAQIN_AWS_PROFILE", "aws-some-work-account")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError):
        _ = get_settings().aws_enabled
