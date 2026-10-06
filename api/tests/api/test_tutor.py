import pytest

from app.agents.tutor.agent import parse_answer
from app.gateways.llm_gateway import LLMUnavailable

pytestmark = pytest.mark.usefixtures("learner")

VERSE_5_6_AR_FRAGMENT = "فَٱغْسِلُوا۟ وُجُوهَكُمْ وَأَيْدِيَكُمْ إِلَى ٱلْمَرَافِقِ"


def route(tier="A", query="wudu face arms وضوء"):
    return {"tier": tier, "hostile": False, "search_query": query}


def ask(client, question="What are the parts of wudu?", **kw):
    r = client.post("/api/tutor/ask", json={"question": question, "lang": "en", **kw})
    assert r.status_code == 200, r.text
    return r.json()


def test_unknown_citation_ids_withhold_the_answer(client, fake_llm):
    fake_llm(
        route(),
        {
            "answer": "Wudu has four parts. [[quran:5:6]] See also [[hadith:bukhari:999999]] and [[quran:7:7]].",
            "makes_religious_claim": True,
            "follow_ups": [],
        },
    )
    body = ask(client, lesson_id="wudu-order")
    ids = [b["id"] for b in body["answer"] if b["type"] == "source"]
    assert ids == []
    assert body["sources"] == {}
    assert body["tier"] == "NONE"
    assert all("[[" not in b.get("text", "") for b in body["answer"])


def test_religious_claim_without_valid_citation_abstains(client, fake_llm):
    fake_llm(
        route(),
        {
            "answer": "The Prophet said wudu must be done twice. [[hadith:made:up]]",
            "makes_religious_claim": True,
            "follow_ups": [],
        },
    )
    body = ask(client)
    assert body["tier"] == "NONE"
    assert body["sources"] == {}
    assert "couldn't find an approved source" in body["answer"][0]["text"]
    assert "twice" not in str(body["answer"])


def test_personal_case_returns_referral_and_no_ruling(client, fake_llm):
    fake_llm(
        route("D", "marriage contract"),
        {
            "answer": "Generally, wudu is described in [[quran:5:6]].",
            "makes_religious_claim": True,
            "follow_ups": [],
        },
    )
    body = ask(client, "I live in France, is my marriage valid in my situation?")
    assert body["tier"] == "D"
    assert body["referral"]["en"].startswith("This touches on your personal situation")
    assert body["referral"]["ar"]
    assert body["answer"][0]["text"].startswith("I can share general information")


def test_personal_case_without_sources_still_refers(client, fake_llm):
    fake_llm(route("D", "zzzz qqqq"), {"answer": "x", "makes_religious_claim": True, "follow_ups": []})
    body = ask(client, "zzzz qqqq in my case?")
    assert body["tier"] == "D" and body["referral"] and body["sources"] == {}


def test_scripture_text_comes_from_db_not_model(client, fake_llm):
    fake_llm(
        route(),
        {
            "answer": "The verse describes washing. [[quran:5:6]]",
            "makes_religious_claim": True,
            "follow_ups": [],
        },
    )
    body = ask(client, lesson_id="wudu-order")
    texts = " ".join(b["text"] for b in body["answer"] if b["type"] == "text")
    assert "وُجُوهَكُمْ" not in texts
    stored = body["sources"]["quran:5:6"]["text_ar"]
    assert "وُجُوهَكُمْ" in stored and "قُمْتُمْ" in stored


def test_out_of_scope_declines_without_retrieval(client, fake_llm):
    fake = fake_llm(route("OUT"))
    body = ask(client, "Write me a poem about football")
    assert body["tier"] == "OUT" and body["sources"] == {}
    assert len(fake.calls) == 1


def test_no_sources_found_abstains_before_answering(client, fake_llm):
    fake = fake_llm(route("B", "xyzzy plugh"))
    body = ask(client, "xyzzy plugh?")
    assert body["tier"] == "NONE"
    assert len(fake.calls) == 1


def test_model_failure_never_500s(client, fake_llm):
    fake_llm(route(), LLMUnavailable("boom"))
    body = ask(client, lesson_id="wudu-order")
    assert body["tier"] == "NONE" and body["ai_generated"] is False


def test_offline_mode_shows_labelled_keyword_matches(client, fake_llm):
    fake_llm(LLMUnavailable("no aws"))
    body = ask(client, "no compulsion in religion")
    assert body["tier"] == "NONE" and body["ai_generated"] is False
    assert "quran:2:256" in body["sources"]


def test_follow_ups_capped_at_three(client, fake_llm):
    fake_llm(
        route(),
        {"answer": "Four parts. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": ["a", "b", "c", "d", "e"]},
    )
    assert len(ask(client, lesson_id="wudu-order")["follow_ups"]) == 3


def test_tutor_logs_hold_no_question_text(client, fake_llm):
    from app.main import app

    fake_llm(route(), {"answer": "Four parts. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": []})
    ask(client, "my secret question about wudu", lesson_id="wudu-order")
    log = app.state.services.repository.logs[-1]
    assert log["citation_ids"] == ["quran:5:6"]
    assert "secret" not in str(log)


def test_parse_answer_dedupes_and_keeps_order():
    blocks, cited, _ = parse_answer("A [[quran:5:6]] B [[quran:2:256]] C [[quran:5:6]]", {"quran:5:6", "quran:2:256"})
    assert cited == ["quran:5:6", "quran:2:256"]
    assert [b["type"] for b in blocks] == ["text", "source", "text", "source", "text"]


def test_explain_back_maps_key_ideas(client, fake_llm):
    fake = fake_llm(
        {
            "covered": ["k1", "k2", "k4", "not-an-idea"],
            "misconceptions": [
                {"text": "Feet before head", "correction": "Wipe the head before the feet.", "source": "quran:5:6"},
            ],
            "feedback": "Good start.",
        }
    )
    r = client.post(
        "/api/tutor/explain-back", json={"lesson_id": "wudu-order", "transcript": "face, arms, feet", "lang": "en"}
    )
    body = r.json()
    assert body["covered"] == ["k1", "k2", "k4"]
    assert body["missed"] == ["k3"]
    assert body["misconceptions"][0]["source"] == "quran:5:6"
    assert len(body["misconceptions"]) == 1
    assert set(body["sources"]) == {"quran:5:6"}
    assert fake.calls[0]["model"] == fake.support_calls[0]["model"] == "anthropic.claude-sonnet-5"


def test_model_cannot_hide_unsourced_claims_behind_its_own_boolean(client, fake_llm):
    fake_llm(route(), {"answer": "You must repeat every prayer twice.",
                      "makes_religious_claim": False, "follow_ups": ["Repeat every prayer?"]})
    body = ask(client, lesson_id="wudu-order")
    assert body["tier"] == "NONE" and body["sources"] == {}
    assert "repeat" not in str(body["answer"]).lower()
    assert body["follow_ups"] == []


def test_sources_withdrawn_during_answering_are_not_shown(client, fake_llm, monkeypatch):
    from app.main import app

    repo = app.state.services.repository
    original = repo.get_sources
    reads = 0

    async def sources(ids):
        nonlocal reads
        reads += 1
        found = await original(ids)
        return {sid: {**value, "review_status": "pending"} for sid, value in found.items()} if reads > 1 else found

    monkeypatch.setattr(repo, "get_sources", sources)
    fake_llm(route(), {"answer": "Wash the face. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": []})
    body = ask(client, lesson_id="wudu-order")
    assert body["tier"] == "NONE" and body["sources"] == {}


@pytest.mark.parametrize("lang", ["en", "ar"])
def test_explain_back_source_changes_discard_generated_feedback(client, fake_llm, monkeypatch, lang):
    from app.main import app

    repo = app.state.services.repository
    original = repo.get_sources
    reads = 0

    async def sources(ids):
        nonlocal reads
        reads += 1
        found = await original(ids)
        return {sid: {**value, "text_ar": "changed evidence"} for sid, value in found.items()} if reads > 1 else found

    monkeypatch.setattr(repo, "get_sources", sources)
    fake_llm({"covered": ["k1"], "misconceptions": [], "feedback": "Generated feedback from old evidence."})
    response = client.post("/api/tutor/explain-back",
                           json={"lesson_id": "wudu-order", "transcript": "face then arms", "lang": lang})
    assert response.status_code == 200
    body = response.json()
    assert body["awaiting_review"] is True and body["ai_generated"] is False
    assert body["sources"] == {} and body["covered"] == []
    assert "Generated" not in body["feedback"]


def test_explain_back_offline_keyword_fallback(client, fake_llm):
    fake_llm(LLMUnavailable("offline"))
    r = client.post(
        "/api/tutor/explain-back",
        json={
            "lesson_id": "wudu-order",
            "transcript": "I wash my face, then my arms to the elbows, then wash my feet",
            "lang": "en",
        },
    )
    body = r.json()
    assert body["ai_generated"] is False
    assert "k1" in body["covered"] and "k3" in body["missed"]


def test_explain_back_unknown_lesson_404(client, fake_llm):
    r = client.post("/api/tutor/explain-back", json={"lesson_id": "nope", "transcript": "x"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_offline_retrieval_searches_lesson_prose_en_and_ar(client, fake_llm):
    # "sword" appears only in lesson card prose, not in any source text.
    for q, lang in (("Did Islam spread by the sword?", "en"), ("هل انتشر الإسلام بالسيف؟", "ar")):
        fake_llm(LLMUnavailable("no aws"))
        r = client.post("/api/tutor/ask", json={"question": q, "lang": lang})
        body = r.json()
        assert body["tier"] == "NONE" and body["ai_generated"] is False
        assert "quran:2:256" in body["sources"], (lang, body)
        assert (
            body["answer"][0]["text"]
            == __import__("app.agents.tutor.prompts", fromlist=["TEXT"]).TEXT["unavailable"][lang]
        )


def test_null_sources_on_key_ideas_and_quiz_are_accepted(client, fake_llm):
    assert client.get("/api/lessons/spread").status_code == 200
    fake_llm(LLMUnavailable("offline"))
    r = client.post(
        "/api/tutor/explain-back", json={"lesson_id": "spread", "transcript": "belief cannot be forced", "lang": "en"}
    )
    assert r.status_code == 200 and r.json()["covered"] == ["k1"]
