"""Adversarial support plumbing with an explicit independent judge, no live model."""

import json

import pytest

from app.gateways.llm_gateway import LLMUnavailable
from app.main import app
from tests.api.test_tutor import VERSE_5_6_AR_FRAGMENT, ask, route
from tests.support_fake import support_reply

pytestmark = pytest.mark.usefixtures("learner")


def judge(fake, outcome):
    original = fake.structured
    calls = []

    async def structured(**kw):
        if not kw["system"].startswith("EVIDENCE_SUPPORT_REVIEW_V1"):
            return await original(**kw)
        calls.append(kw)
        if outcome == "outage":
            raise LLMUnavailable("private provider detail")
        result = support_reply(kw)
        if outcome == "invalid":
            return {"approved": True}
        if outcome == "personal":
            result["personal_ruling"] = True
        if outcome in {"irrelevant", "unsupported"}:
            result["units"][0]["verdict"] = "unsupported"
        if outcome == "unknown":
            result["units"][0]["evidence"][0]["source"] = "quran:unknown"
        if outcome == "mismatch":
            result["units"][0]["evidence"][0]["excerpt"] = "a fabricated translation"
        if outcome == "non_claim":
            result["units"][0]["verdict"] = "non_claim"
        return result

    fake.structured = structured
    return calls


# Ask answers: see test_sentence_review.py. The full evidence review below still covers explain-back.


@pytest.mark.parametrize("outcome", ["unsupported", "outage", "unknown", "mismatch", "personal", "non_claim"])
def test_explain_back_rejection_withholds_feedback_and_corrections(client, fake_llm, outcome):
    fake = fake_llm(
        {
            "covered": ["k1"],
            "misconceptions": [
                {"text": "Learner words", "correction": "Your prayer is invalid in your case.", "source": "quran:5:6"}
            ],
            "feedback": "You must repeat every prayer.",
        }
    )
    calls = judge(fake, outcome)
    response = client.post("/api/tutor/explain-back", json={"lesson_id": "wudu-order", "transcript": "face"})
    body = response.json()
    assert not body["covered"] and not body["misconceptions"] and not body["sources"]
    assert not body["ai_generated"] and "repeat" not in body["feedback"]
    assert len(fake.calls) == 1 and len(calls) == 1
    units = json.loads(calls[0]["messages"][0]["content"])["units"]
    assert units["candidate.misconceptions.0.correction"] == "Your prayer is invalid in your case."


@pytest.mark.parametrize("field", ["feedback", "correction", "text"])
def test_explain_back_never_changes_judge_candidate_by_stripping_scripture(client, fake_llm, field):
    output = {
        "covered": ["k1"],
        "misconceptions": [{"text": "Learner words", "correction": "Wash the face.", "source": "quran:5:6"}],
        "feedback": "Good start.",
    }
    if field == "feedback":
        output[field] = f"﴿{VERSE_5_6_AR_FRAGMENT}﴾"
    else:
        output["misconceptions"][0][field] = f"﴿{VERSE_5_6_AR_FRAGMENT}﴾"
    fake_llm(output)
    body = client.post("/api/tutor/explain-back", json={"lesson_id": "wudu-order", "transcript": "face"}).json()
    assert not body["ai_generated"] and not body["misconceptions"] and not body["sources"]
    assert "وُجُوهَكُمْ" not in body["feedback"]


def test_invalid_explain_back_source_withholds_every_correction(client, fake_llm):
    fake_llm(
        {
            "covered": ["k1"],
            "misconceptions": [{"text": "x", "correction": "y", "source": "quran:unknown"}],
            "feedback": "Claim from an unknown source.",
        }
    )
    body = client.post("/api/tutor/explain-back", json={"lesson_id": "wudu-order", "transcript": "face"}).json()
    assert not body["misconceptions"] and not body["sources"] and not body["ai_generated"]


def test_source_store_outage_after_generation_returns_fixed_safe_response(client, fake_llm, monkeypatch):
    repo = app.state.services.repository
    original = repo.get_sources
    reads = 0

    async def sources(ids):
        nonlocal reads
        reads += 1
        if reads > 1:
            raise RuntimeError("private database URL")
        return await original(ids)

    monkeypatch.setattr(repo, "get_sources", sources)
    fake_llm(route(), {"answer": "Wash the face. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": []})
    body = ask(client, lesson_id="wudu-order")
    assert not body["sources"] and not body["ai_generated"] and "private" not in str(body)
