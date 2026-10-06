"""Light Ask review: one verdict per sentence, source ids only, unsupported sentences removed."""
import json

import pytest

from app.gateways.llm_gateway import LLMUnavailable
from app.main import app
from tests.api.test_tutor import ask, route
from tests.support_fake import sentence_reply

pytestmark = pytest.mark.usefixtures("learner")


def sentence_judge(fake, outcome):
    calls = []

    def review(kw):
        calls.append(kw)
        result = sentence_reply(kw)
        rows = result["sentences"]
        if outcome == "personal":
            result["personal_ruling"] = True
        if outcome == "unsupported":
            rows[0]["verdict"] = "unsupported"
        if outcome == "unknown":
            rows[0]["sources"] = ["quran:unknown"]
        if outcome == "mismatch":
            rows[0]["sources"] = ["quran:2:256"]  # does not cover the sentence's own marker
        if outcome == "non_claim":
            rows[0].update(verdict="non_claim", sources=[])
        if outcome == "missing":
            del rows[0]
        return result

    fake.sentence_review = LLMUnavailable("private provider detail") if outcome == "outage" else review
    return calls


@pytest.mark.parametrize("outcome", ["unsupported", "outage", "unknown", "mismatch", "non_claim", "missing"])
def test_unsupported_cited_sentence_is_never_shown(client, fake_llm, outcome):
    fake = fake_llm(route("B"), {"answer": "Wudu has four parts. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": []})
    calls = sentence_judge(fake, outcome)
    body = ask(client, "parts of wudu?", lesson_id="wudu-order")
    assert body["sources"] == {} and body["tier"] == "NONE" and not body["ai_generated"]
    assert "four parts" not in str(body["answer"])
    assert len(fake.calls) == 2 and len(calls) <= 1  # no redraft


def test_personal_ruling_returns_general_information_and_referral(client, fake_llm):
    fake = fake_llm(route("B"), {"answer": "Your marriage is valid. [[quran:5:6]]", "makes_religious_claim": True,
                                 "follow_ups": ["Must you divorce immediately?"]})
    sentence_judge(fake, "personal")
    body = ask(client, "Is my marriage valid?", lesson_id="wudu-order")
    assert body["tier"] == "D" and body["referral"] and body["sources"] == {}
    assert "marriage is valid" not in str(body["answer"]) and not body["follow_ups"]


def test_only_the_unsupported_sentence_is_removed(client, fake_llm):
    fake = fake_llm(route("B"), {"answer": "Wudu has four parts. [[quran:5:6]]\n\nIt was revealed in Makkah in 610.",
                                 "makes_religious_claim": True, "follow_ups": ["What breaks wudu?"]})
    calls = []

    def review(kw):
        calls.append(kw)
        result = sentence_reply(kw)
        for row in result["sentences"]:
            if row["id"] == "s1":
                row.update(verdict="unsupported", sources=[])
        return result

    fake.sentence_review = review
    body = ask(client, "parts of wudu?", lesson_id="wudu-order")
    text = " ".join(b.get("text", "") for b in body["answer"] if b["type"] == "text")
    assert "four parts" in text and "610" not in text
    assert list(body["sources"]) == ["quran:5:6"] and body["follow_ups"] == ["What breaks wudu?"]
    payload = json.loads(calls[0]["messages"][0]["content"])
    assert set(payload["sentences"]) == {"s0", "s1", "f0"}
    assert calls[0]["think"] is False and "excerpt" not in json.dumps(calls[0]["schema"])


@pytest.mark.parametrize("lang,evidence_lang", [("en", "ar"), ("ar", "en")])
def test_cross_language_review_receives_original_evidence(client, fake_llm, lang, evidence_lang):
    source = app.state.services.repository.sources["quran:5:6"]
    original = source["text_" + evidence_lang]
    source["text_" + ("en" if evidence_lang == "ar" else "ar")] = ""
    answer = "Wash the face. [[quran:5:6]]" if lang == "en" else "غسل الوجه. [[quran:5:6]]"
    fake = fake_llm(route(), {"answer": answer, "makes_religious_claim": True, "follow_ups": []})
    calls = sentence_judge(fake, "pass")
    response = client.post("/api/tutor/ask", json={"question": "wudu", "lesson_id": "wudu-order", "lang": lang})
    assert response.json()["sources"]["quran:5:6"]["text_" + evidence_lang] == original
    payload = json.loads(calls[0]["messages"][0]["content"])
    assert payload["sources"]["quran:5:6"]["text_" + evidence_lang] == original


def test_answer_is_written_without_hidden_thinking(client, fake_llm):
    fake = fake_llm(route("B"), {"answer": "Four parts. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": []})
    ask(client, lesson_id="wudu-order")
    assert fake.calls[1]["think"] is False and fake.calls[1]["effort"] == "low"
