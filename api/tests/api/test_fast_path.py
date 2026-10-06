"""Uniform review and two-phase delivery of the tutor answer."""
import pytest

from tests.api.test_tutor import ask, route

pytestmark = pytest.mark.usefixtures("learner")


def test_every_tier_is_reviewed_the_same_way(client, fake_llm, monkeypatch):
    from app.main import app
    from tests.api.test_sentence_review import sentence_judge

    monkeypatch.setattr(app.state.services.tutor, "review_skip_tiers", {"A"})  # legacy setting is ignored
    for tier in ("A", "B"):
        fake = fake_llm(route(tier), {"answer": "Four parts. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": []})
        reviews = sentence_judge(fake, "pass")
        body = ask(client, lesson_id="wudu-order")
        assert body["tier"] == tier and len(reviews) == 1


def test_stream_sends_the_draft_then_the_final_result(client, fake_llm):
    fake_llm(route("B"), {"answer": "Four parts. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": []})
    with client.stream("POST", "/api/tutor/ask/stream", json={"question": "parts of wudu?", "lang": "en", "lesson_id": "wudu-order"}) as r:
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/event-stream")
        events = [line for line in r.iter_lines() if line.startswith("event:")]
    assert events == ["event: draft", "event: final"]
