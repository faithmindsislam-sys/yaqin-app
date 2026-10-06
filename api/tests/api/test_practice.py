"""Offline checks of practice plumbing, not live model quality or scholarly review."""

import json
from copy import deepcopy
from unittest.mock import AsyncMock

import httpx
import pytest

from app.agents.tutor import practice
from app.configuration.settings import Settings
from app.domain.safety import SafetyBlocked
from app.domain.support import SupportFailure, validate_support
from app.gateways.http_agent_gateway import HttpAgentGateway
from app.gateways.llm_gateway import LLMUnavailable
from app.main import app
from tests.api.test_tutor_agent import FakeAgent
from tests.support_fake import support_reply

pytestmark = pytest.mark.usefixtures("learner")
ROUTE = {"tier": "A", "hostile": False, "search_query": "wudu", "practice": True}
REQUEST = {"question": "Quiz me on this page", "course_id": "wudu-order", "card_id": "c1", "track": "explore"}


def questions():
    return [
        {
            "question": {"en": "Which part is wiped during wudu?", "ar": "أي عضو يُمسح في الوضوء؟"},
            "options": [
                {"en": "The head", "ar": "الرأس"},
                {"en": "The feet", "ar": "القدمان"},
                {"en": "The face", "ar": "الوجه"},
            ],
            "answer": 0,
            "hint": {"en": "Think about washing versus wiping.", "ar": "فكّر في الفرق بين الغسل والمسح."},
            "explanation": {
                "en": "The verse distinguishes wiping the head from washing.",
                "ar": "تميّز الآية مسح الرأس عن الغسل.",
            },
            "source": "quran:5:6",
        },
        {
            "question": {"en": "To which point are the arms washed?", "ar": "إلى أين تُغسل اليدان؟"},
            "options": [
                {"en": "To the elbows", "ar": "إلى المرفقين"},
                {"en": "To the wrists", "ar": "إلى الرسغين"},
                {"en": "To the shoulders", "ar": "إلى الكتفين"},
            ],
            "answer": 0,
            "hint": {"en": "Think about the boundary taught on this page.", "ar": "تذكّر الحدّ الموضّح في هذه الصفحة."},
            "explanation": {"en": "The course's source specifies the elbows.", "ar": "يحدّد مصدر الدورة المرفقين."},
            "source": "quran:5:6",
        },
    ]


@pytest.mark.parametrize(
    "lang,question",
    [
        ("en", "Give me more questions about this topic"),
        ("ar", "أعطني أسئلة إضافية عن هذه الصفحة"),
        ("ar", "اختبرني في هذه الصفحة"),
        ("en", "Can we practise the idea I just studied?"),
    ],
)
def test_natural_course_practice_is_bilingual_reviewed_and_never_saved(client, fake_llm, lang, question):
    store = app.state.services.repository
    before = deepcopy((store.lessons, store.progress))
    fake = fake_llm(ROUTE, {"practice": questions()})
    response = client.post("/api/tutor/ask", json={**REQUEST, "lang": lang, "question": question})
    assert response.status_code == 200
    out = response.json()
    assert out["answer"] == [] and out["ai_generated"] is True
    assert [q["answer"] for q in out["practice"]] == [0, 1]
    assert out["practice"][1]["options"][1] == questions()[1]["options"][0]
    assert (store.lessons, store.progress) == before
    review = json.loads(fake.support_calls[0]["messages"][0]["content"])
    assert any(uid.endswith("correct.en") for uid in review["units"])
    assert any(uid.endswith("correct.ar") for uid in review["units"])
    assert any("hint" in uid for uid in review["units"])
    assert any("explanation" in uid for uid in review["units"])
    assert review["context"]["learning_context"]["current_page"]["id"] == "c1"
    assert "Explore" in fake.calls[1]["system"]


@pytest.mark.parametrize("failure", [LLMUnavailable("offline"), {"practice": []}, {"practice": [questions()[0]]}])
def test_unavailable_abstained_or_invalid_generation_returns_unavailable(client, fake_llm, failure):
    fake_llm(ROUTE, failure)
    out = client.post("/api/tutor/ask", json=REQUEST).json()
    assert out["practice_fallback"] is True and out["ai_generated"] is False and "practice" not in out


def test_classifier_outage_returns_unavailable_for_recognized_practice(client, fake_llm):
    fake_llm(LLMUnavailable("offline"))
    assert client.post("/api/tutor/ask", json=REQUEST).json()["practice_fallback"]


def test_session_question_exclusions_reach_writer_and_reject_repeated_generation(client, fake_llm):
    old_question = questions()[0]["question"]["ar"]
    fake = fake_llm(ROUTE, {"practice": questions()})
    out = client.post("/api/tutor/ask", json={**REQUEST, "practice_avoid": [old_question]}).json()
    assert out["practice_fallback"] is True and "practice" not in out
    assert old_question in fake.calls[1]["messages"][-1]["content"]


def test_remote_session_question_exclusions_are_forwarded_and_enforced(client, fake_llm, monkeypatch):
    old_question = questions()[0]["question"]["en"]
    fake_llm(ROUTE)
    remote = FakeAgent(reply={"answer": "", "practice": questions(), "practice_version": "1", "learning_context_version": "1"})
    monkeypatch.setattr(app.state.services.tutor, "agent", remote)
    out = client.post("/api/tutor/ask", json={**REQUEST, "practice_avoid": [old_question]},
                      headers={"Authorization": "Bearer learner-fixture"}).json()
    assert old_question in remote.calls[0][0]["practiceAvoid"]
    assert out["practice_fallback"] is True and "practice" not in out


@pytest.mark.parametrize(
    "change", ["unknown-source", "bad-index", "duplicate-option", "missing-ar", "leaky-hint", "source-marker"]
)
def test_practice_validation_rejects_unsafe_shapes(change):
    items = questions()
    q = items[0]
    if change == "unknown-source":
        q["source"] = "quran:unknown"
    if change == "bad-index":
        q["answer"] = True
    if change == "duplicate-option":
        q["options"][1] = q["options"][0]
    if change == "missing-ar":
        q["question"]["ar"] = ""
    if change == "leaky-hint":
        q["hint"]["en"] = "Consider the head."
    if change == "source-marker":
        q["explanation"]["en"] = "[[quran:5:6]]"
    with pytest.raises(SupportFailure):
        practice.validate(items, {"quran:5:6": {}})


def test_question_bank_duplicates_and_non_claim_correct_answers_cannot_pass_review():
    with pytest.raises(SupportFailure):
        practice.validate(questions(), {"quran:5:6": {}}, [questions()[0]["question"]["ar"]])
    items = practice.validate(questions(), {"quran:5:6": {}})
    units = practice.units(items)
    source = {"kind": "fiqh", "text_en": "Original evidence", "text_ar": "دليل أصلي"}
    payload = {"units": units, "sources": {"quran:5:6": source}}
    verdict = support_reply({"messages": [{"content": json.dumps(payload)}]})
    correct = next(row for row in verdict["units"] if row["id"].endswith("correct.en"))
    correct.update(verdict="non_claim", evidence=[])
    with pytest.raises(SupportFailure):
        validate_support(verdict, units, payload["sources"])


@pytest.mark.parametrize("rejection", ["correct", "hint", "explanation", "raw-source", "moderation"])
def test_review_rejection_source_changes_and_moderation_never_return_generated_quiz(
    client, fake_llm, monkeypatch, rejection
):
    fake = fake_llm(ROUTE, {"practice": questions()})
    original = fake.structured

    async def structured(**kwargs):
        out = await original(**kwargs)
        if kwargs["system"].startswith("EVIDENCE_SUPPORT_REVIEW_V1"):
            if rejection == "raw-source":
                app.state.services.repository.sources["quran:5:6"]["text_en"] = "Changed raw source"
            elif rejection != "moderation":
                row = next(row for row in out["units"] if rejection in row["id"])
                row["verdict"] = "unsupported"
        return out

    monkeypatch.setattr(fake, "structured", structured)
    if rejection == "moderation":
        monkeypatch.setattr(fake, "assess", AsyncMock(side_effect=SafetyBlocked()))
    out = client.post("/api/tutor/ask", json=REQUEST).json()
    assert "practice" not in out
    if rejection != "moderation":
        assert out["practice_fallback"] is True
    else:
        assert out["safety_outcome"] == "safety_blocked" and "practice_fallback" not in out


def test_assessment_mode_missing_page_and_unpublished_course_never_generate(client, fake_llm):
    fake = fake_llm(ROUTE, {"practice": questions()})
    for body in ({**REQUEST, "card_id": None}, {**REQUEST, "card_id": None, "practice": True}):
        out = client.post("/api/tutor/ask", json=body).json()
        assert "practice" not in out and "practice_fallback" not in out
    assert fake.calls == []
    assert client.post("/api/tutor/ask", json={**REQUEST, "card_id": "other"}).status_code == 400
    assert client.post("/api/tutor/ask", json={**REQUEST, "course_id": "draft-lesson"}).status_code == 404


@pytest.mark.parametrize("version", [None, "1"])
def test_remote_practice_and_older_service_compatibility(client, fake_llm, monkeypatch, version):
    fake_llm(ROUTE, {"practice": questions()})
    remote = FakeAgent(
        reply={"answer": "", "practice": questions(), "practice_version": version, "learning_context_version": "1"}
    )
    monkeypatch.setattr(app.state.services.tutor, "agent", remote)
    out = client.post("/api/tutor/ask", json=REQUEST, headers={"Authorization": "Bearer learner-jwt"}).json()
    assert len(out["practice"]) == 2
    assert remote.calls[0][0]["mode"] == "practice" and remote.calls[0][1] == "Bearer learner-jwt"


def test_personal_rulings_and_out_requests_do_not_generate(client, fake_llm):
    for tier in ("D", "OUT"):
        fake_llm({**ROUTE, "tier": tier}, {"practice": questions()})
        out = client.post("/api/tutor/ask", json=REQUEST).json()
        assert "practice" not in out and "practice_fallback" not in out


async def test_remote_support_rejection_returns_unavailable_without_retrying_writer(client, fake_llm, monkeypatch):
    fake = fake_llm(ROUTE)
    gateway = HttpAgentGateway(Settings(_env_file=None, agents_service_url="https://agents.example.test"))
    await gateway.client.aclose()
    calls = []
    def respond(request):
        calls.append(json.loads(request.content))
        return httpx.Response(503, json={"errorCode": "source_support_rejected"})
    gateway.client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    monkeypatch.setattr(app.state.services.tutor, "agent", gateway)
    try:
        out = client.post("/api/tutor/ask", json=REQUEST, headers={"Authorization": "Bearer learner-jwt"}).json()
    finally:
        await gateway.close()
    assert out["practice_fallback"] is True and "practice" not in out
    assert len(fake.calls) == 1 and len(calls) == 1
