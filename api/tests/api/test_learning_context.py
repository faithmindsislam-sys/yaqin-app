"""Authenticated course/page context reaches both tutors without becoming evidence."""
import json
from contextlib import nullcontext
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID

import pytest

from app.agents.tutor.learning_context import MAX_CONTEXT_BYTES, learning_context
from app.agents.tutor.agent import TutorAgent
from app.contracts.tutor import AskRequest
from app.domain.search import Retrieved
from app.gateways.agent_gateway import AgentUnavailable
from app.main import app
from app.repositories.postgres_repository import PostgresRepository

USER = "00000000-0000-0000-0000-000000000001"
OTHER = "00000000-0000-0000-0000-000000000002"
ROUTE = {"tier": "A", "hostile": False, "search_query": "wudu"}
ANSWER = {"answer": "Wash the face. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": []}


def request(**extra):
    return {"question": "Explain this page", "course_id": "wudu-order", "card_id": "c1",
            "track": "first-steps", **extra}


def prior_courses(repository):
    original = repository.lessons["wudu-order"]
    for cid, owner, status, coming_soon in [("own", USER, "published", False),
                                           ("other", OTHER, "published", False),
                                           ("hidden", USER, "draft", False),
                                           ("soon", USER, "published", True)]:
        repository.lessons[cid] = {**deepcopy(original), "id": cid, "status": status, "coming_soon": coming_soon,
            "title": {"en": cid, "ar": cid}, "author_id": "staff-private",
            "summary": {"en": "Prior idea", "ar": "فكرة سابقة"}}
        repository.progress[owner, cid] = {"completed_at": "2026-10-01", "note": "PRIVATE NOTE", "quiz_score": 1}


@pytest.mark.usefixtures("learner")
@pytest.mark.parametrize("lang", ["en", "ar"])
@pytest.mark.parametrize("remote_mode", ["new", "outage", "old"])
def test_published_page_module_own_completion_and_history_reach_both_paths(client, fake_llm, monkeypatch, lang, remote_mode):
    prior_courses(app.state.services.repository)
    response = {**ANSWER, "library_sources": [], "learning_context_version": "1"}
    if remote_mode == "old":
        response.pop("learning_context_version")
    remote = SimpleNamespace(enabled=True, ask=AsyncMock(return_value=response))
    if remote_mode == "outage":
        remote.ask.side_effect = AgentUnavailable("offline")
    monkeypatch.setattr(app.state.services.tutor, "agent", remote)
    fake = fake_llm(ROUTE, ANSWER)
    result = client.post("/api/tutor/ask", json=request(lang=lang,
        history=[{"role": "user", "content": f"turn-{n}"} for n in range(9)],
        user_id=OTHER, completed_courses=["other"], learning_context={"trusted": True}),
        headers={"Authorization": "Bearer learner-jwt"})
    assert result.status_code == 200 and result.json()["sources"]
    payload = remote.ask.call_args.args[0]
    context = payload["learningContext"]
    assert remote.ask.call_args.kwargs["authorization"] == "Bearer learner-jwt"
    assert context["current_page"]["id"] == "c1"
    assert context["current_page"]["body"] == app.state.services.repository.lessons["wudu-order"]["cards"][0]["body"][lang]
    assert [p["id"] for p in context["course"]["pages"]] == ["c1", "c2"]
    assert context["module"]["id"] == "purification"
    assert "draft-lesson" not in [c["id"] for c in context["module"]["courses"]]
    assert [c["id"] for c in context["completed_courses"]] == ["own"]
    assert all(set(c) == {"id", "title", "summary"} for c in context["completed_courses"])
    assert "PRIVATE NOTE" not in json.dumps(context) and "staff-private" not in json.dumps(context)
    assert [t["content"] for t in payload["history"]] == [f"turn-{n}" for n in range(3, 9)]
    assert payload["sources"][0]["id"] == "quran:5:6"
    assert "turn-8" in fake.calls[0]["messages"][0]["content"]  # classifier resolves follow-up referents
    if remote_mode != "new":
        assert json.dumps(context, ensure_ascii=False) in fake.calls[1]["messages"][-1]["content"]
        assert "Mariam" in fake.calls[1]["system"] and "not evidence" in fake.calls[1]["system"]
    else:
        assert len(fake.calls) == 1
    assert fake.support_calls[-1]["messages"][0]["content"].find('"learning_context"') >= 0


@pytest.mark.usefixtures("learner")
@pytest.mark.parametrize("body,status", [(request(card_id="other-page"), 400),
    (request(course_id="draft-lesson"), 404), (request(course_id="missing"), 404),
    ({"question": "Explain", "card_id": "c1"}, 400), (request(card_id=""), 400)])
def test_invalid_or_unpublished_course_context_never_reaches_generation(client, fake_llm, body, status):
    fake = fake_llm()
    assert client.post("/api/tutor/ask", json=body).status_code == status
    assert fake.calls == []


@pytest.mark.parametrize("body", ["ن" * 12000, "😀" * 12000, '"\\\n' * 12000, "\x01" * 12000])
async def test_context_has_explicit_coverage_and_serialized_utf8_limit(body):
    card = {"id": "p", "title": {"ar": body}, "body": {"ar": body}, "takeaway": {"ar": body},
            "sources": ["quran:" + body[0] * 120] * 30}
    lesson = {"id": "course", "title": {"ar": body}, "summary": {"ar": body}, "cards": [card,
              *[{**card, "id": f"page-{n}"} for n in range(99)]]}
    repository = SimpleNamespace(list_tracks=AsyncMock(return_value=[]))
    context = await learning_context(repository, AskRequest(**request(course_id="course", card_id="p", lang="ar")), lesson)
    assert len(json.dumps(context, ensure_ascii=False).encode()) <= MAX_CONTEXT_BYTES
    assert context["current_page"]["id"] == "p" and context["current_page"]["body"]
    assert context["coverage"]["truncated_fields"] and context["coverage"]["truncated_field_count"] > 0
    assert len(context["coverage"]["truncated_fields"]) <= 16


async def test_postgres_completed_query_is_own_account_published_and_bounded():
    conn = SimpleNamespace(fetch=AsyncMock(return_value=[{"data": {"id": "own"}}]))
    repository = PostgresRepository(SimpleNamespace(acquire=lambda: nullcontext(conn)))
    assert await repository.completed_courses(USER, "explore", exclude="current", limit=100) == [{"id": "own"}]
    query, *values = conn.fetch.call_args.args
    assert values == [UUID(USER), "current", "explore", 3]
    assert "p.user_id = $1::uuid" in query and "p.completed_at IS NOT NULL" in query
    assert "l.status = 'published'" in query and "coming_soon" in query and "l.data->'tracks' ? $3" in query


async def test_large_unicode_ids_sources_and_module_still_keep_current_page_within_budget():
    ids = [str(n) + "😀" * 98 for n in range(100)]
    sources = ["quran:" + str(n) + "😀" * 118 for n in range(12)]
    lesson = {"id": "course", "title": {"ar": "😀" * 12000}, "summary": {"ar": "😀" * 12000},
              "cards": [{"id": cid, "title": {"ar": "ن" * 400}, "body": {"ar": "ن" * 6000},
                         "takeaway": {"ar": "ن" * 2000}, "sources": sources} for cid in ids]}
    repository = SimpleNamespace(list_tracks=AsyncMock(return_value=[{"id": "explore", "modules": [
        {"id": "😀" * 100, "title": {"ar": "😀" * 300}, "lessons": [
            {"id": "course", "title": {"ar": "😀" * 400}, "summary": {"ar": "😀" * 1000}}]}]}]))
    context = await learning_context(repository, AskRequest(**request(course_id="course", card_id=ids[0], lang="ar", track="explore")), lesson)
    assert len(json.dumps(context, ensure_ascii=False).encode()) <= MAX_CONTEXT_BYTES
    assert context["current_page"]["id"] == ids[0] and context["module"]["title"]
    assert context["coverage"]["truncated_field_count"] > len(context["coverage"]["truncated_fields"])


@pytest.mark.usefixtures("learner")
def test_missing_module_and_current_page_still_gives_whole_published_course(client, fake_llm):
    fake = fake_llm(ROUTE, ANSWER)
    result = client.post("/api/tutor/ask", json=request(track="explore", card_id=None))
    assert result.status_code == 200 and result.json()["sources"]
    message = fake.calls[1]["messages"][-1]["content"]
    assert '"module": null' in message and '"current_page": null' in message
    assert "Wash the face, the arms to the elbows" in message and "Mariam" in fake.calls[1]["system"]


async def test_large_encoded_bridge_payload_uses_local_path_without_dropping_current_page():
    remote = SimpleNamespace(enabled=True, ask=AsyncMock())
    tutor = TutorAgent(None, None, None, remote)
    req = AskRequest(question="😀" * 1500, lang="ar", track="explore",
        history=[{"role": "user", "content": "😀" * 4000} for _ in range(6)])
    context = {"version": "1", "current_page": {"body": "😀" * 5900}}
    result = await tutor._agent_answer(req, "B", {"search_query": "😀" * 500},
                                     Retrieved({}, {}), {"title": {"en": "😀" * 2000}}, "Bearer learner", context)
    assert result is None
    remote.ask.assert_not_called()
    assert len(req.history) == 6 and len(context["current_page"]["body"]) == 5900


@pytest.mark.usefixtures("learner")
@pytest.mark.parametrize("lang", ["en", "ar"])
@pytest.mark.parametrize("remote_mode", ["new", "outage"])
def test_formatted_page_content_matches_displayed_html_in_both_tutor_paths(client, fake_llm, monkeypatch, lang, remote_mode):
    lesson = app.state.services.repository.lessons["wudu-order"]
    lesson["cards"][0]["body"] = {"en": "STALE BODY", "ar": "نص قديم"}
    lesson["cards"][0]["html"] = {"en": "<p>Visible <strong>page</strong> &amp; detail.</p><script>PRIVATE_SCRIPT</script>",
                                  "ar": "<p>نص <strong>الصفحة</strong> وتفصيلها.</p><script>PRIVATE_SCRIPT</script>"}
    lesson["cards"][1]["html"] = {"en": "<p>Another formatted page.</p>", "ar": "<p>صفحة أخرى منسّقة.</p>"}
    remote = SimpleNamespace(enabled=True, ask=AsyncMock(return_value={**ANSWER, "library_sources": [], "learning_context_version": "1"}))
    if remote_mode == "outage":
        remote.ask.side_effect = AgentUnavailable("offline")
    monkeypatch.setattr(app.state.services.tutor, "agent", remote)
    fake = fake_llm(ROUTE, ANSWER)
    result = client.post("/api/tutor/ask", json=request(lang=lang), headers={"Authorization": "Bearer learner-jwt"})
    assert result.status_code == 200 and result.json()["sources"]
    context = remote.ask.call_args.args[0]["learningContext"]
    expected = "Visible page & detail." if lang == "en" else "نص الصفحة وتفصيلها."
    assert context["current_page"]["body"] == expected
    assert context["course"]["pages"][1]["body"] == ("Another formatted page." if lang == "en" else "صفحة أخرى منسّقة.")
    assert "PRIVATE_SCRIPT" not in json.dumps(context) and "STALE BODY" not in json.dumps(context)
    if remote_mode == "outage":
        assert expected in fake.calls[1]["messages"][-1]["content"]


async def test_optional_large_page_prose_does_not_displace_module_and_owned_completed_summary():
    cards = [{"id": "current", "title": {"en": "Current"}, "body": {"en": "Current page idea"}},
             {"id": "large-one", "title": {"en": "Earlier page"}, "body": {"en": "x" * 11000}},
             {"id": "large", "title": {"en": "Other page"}, "body": {"en": "large " * 1500}}]
    lesson = {"id": "course", "title": {"en": "Course"}, "summary": {"en": "Main idea"}, "cards": cards}
    module = {"id": "module", "title": {"en": "Module title"}, "lessons": [
        {"id": "course", "title": {"en": "Course"}, "summary": {"en": "Main idea"}},
        {"id": "other", "title": {"en": "Other module course"}, "summary": {"en": "Related idea " * 35}}]}
    completed = {"id": "prior", "title": {"en": "My earlier course"}, "summary": {"en": "Prior idea " * 40}}
    repository = SimpleNamespace(list_tracks=AsyncMock(return_value=[{"id": "explore", "modules": [module]}]),
                                 completed_courses=AsyncMock(return_value=[completed]))
    context = await learning_context(repository, AskRequest(question="Explain", course_id="course", card_id="current", track="explore"), lesson, USER)
    assert context["current_page"]["body"] == "Current page idea"
    assert [p["id"] for p in context["course"]["pages"]] == ["current", "large-one", "large"]
    assert [c["title"] for c in context["module"]["courses"]] == ["Course", "Other module course"]
    assert context["completed_courses"][0]["title"] == "My earlier course" and context["completed_courses"][0]["summary"]
    assert "body" not in context["course"]["pages"][2]
    assert "pages.large.prose" in context["coverage"]["truncated_fields"]
    assert len(json.dumps(context, ensure_ascii=False).encode()) <= MAX_CONTEXT_BYTES


@pytest.mark.parametrize("question,lang,practice", [
    ("Explain this page simply", "en", False),
    ("What are the key points of this page?", "en", False),
    ("Explain a word from this page", "en", False),
    ("اشرح هذه الصفحة ببساطة", "ar", False),
    ("ما أهم نقاط هذه الصفحة؟", "ar", False),
    ("اشرح لي كلمة من هذه الصفحة", "ar", False),
    ("Test my knowledge", "en", False),
    ("اختبر معلوماتي", "ar", False),
    ("Give me another quiz", "en", True),
])
async def test_page_shortcuts_keep_page_and_outline_without_loading_unrelated_context(question, lang, practice):
    lesson = {"id": "course", "title": {lang: "Course"}, "cards": [
        {"id": "current", "title": {lang: "Current"}, "body": {lang: "Displayed concept"}, "sources": ["quran:5:6"]},
        {"id": "other", "title": {lang: "Other page"}, "body": {lang: "OTHER PAGE PROSE"}},
    ]}
    repository = SimpleNamespace(list_tracks=AsyncMock(), completed_courses=AsyncMock())
    context = await learning_context(repository, AskRequest(question=question, lang=lang, practice=practice,
        course_id="course", card_id="current", track="first-steps"), lesson, USER)
    assert context["current_page"]["body"] == "Displayed concept"
    assert context["current_page"]["sources"] == ["quran:5:6"]
    assert [p["title"] for p in context["course"]["pages"]] == ["Current", "Other page"]
    assert "OTHER PAGE PROSE" not in json.dumps(context)
    assert {"pages.other.prose", "module", "completed_courses"} <= set(context["coverage"]["truncated_fields"])
    repository.list_tracks.assert_not_awaited()
    repository.completed_courses.assert_not_awaited()


@pytest.mark.usefixtures("learner")
@pytest.mark.parametrize("remote_mode", ["local", "new", "outage"])
@pytest.mark.parametrize("question,narrow", [
    ("Explain this page simply", True), ("ما أهم نقاط هذه الصفحة؟", True),
    ("How does this page connect to the rest of my course?", False),
    ("Compare this word with the definition in my previous course", False),
])
def test_page_shortcuts_load_page_sources_directly_but_arbitrary_questions_keep_course_retrieval(
    client, fake_llm, monkeypatch, question, narrow, remote_mode
):
    tutor = app.state.services.tutor
    lesson = app.state.services.repository.lessons["wudu-order"]
    lesson["cards"][1]["sources"] = ["quran:unrelated"]
    retrieve = AsyncMock(wraps=tutor.retrieval.retrieve)
    monkeypatch.setattr(tutor.retrieval, "retrieve", retrieve)
    page_sources = AsyncMock(wraps=tutor.retrieval.page_sources)
    monkeypatch.setattr(tutor.retrieval, "page_sources", page_sources)
    embed = AsyncMock(wraps=tutor.retrieval.embeddings.embed)
    search = AsyncMock(wraps=tutor.retrieval.repository.search)
    monkeypatch.setattr(tutor.retrieval.embeddings, "embed", embed)
    monkeypatch.setattr(tutor.retrieval.repository, "search", search)
    remote = SimpleNamespace(enabled=True, ask=AsyncMock(return_value={**ANSWER, "library_sources": [], "learning_context_version": "1"}))
    if remote_mode == "outage":
        remote.ask.side_effect = AgentUnavailable("offline")
    monkeypatch.setattr(tutor, "agent", None if remote_mode == "local" else remote)
    fake = fake_llm(ROUTE, ANSWER)
    result = client.post("/api/tutor/ask", json=request(question=question),
                         headers={"Authorization": "Bearer learner-fixture"})
    assert result.status_code == 200 and result.json()["sources"]
    if narrow:
        page_sources.assert_awaited_once_with(lesson["cards"][0])
        retrieve.assert_not_awaited()
        embed.assert_not_awaited()
        search.assert_not_awaited()
        if remote_mode != "local":
            context = remote.ask.call_args.args[0]["learningContext"]
            assert "body" not in context["course"]["pages"][1]
            assert "module" in context["coverage"]["truncated_fields"]
        else:
            assert '"module": null' in fake.calls[1]["messages"][-1]["content"]
    else:
        assert retrieve.call_args.kwargs["lesson"] is lesson
        page_sources.assert_not_awaited()
        embed.assert_awaited_once()
        search.assert_awaited_once()


@pytest.mark.usefixtures("learner")
@pytest.mark.parametrize("citations", [[], ["quran:unknown"]])
def test_page_shortcuts_with_incomplete_citations_fall_back_to_approved_source_search(
    client, fake_llm, monkeypatch, citations
):
    tutor = app.state.services.tutor
    lesson = app.state.services.repository.lessons["wudu-order"]
    lesson["cards"][0]["sources"] = citations
    retrieve = AsyncMock(wraps=tutor.retrieval.retrieve)
    monkeypatch.setattr(tutor.retrieval, "retrieve", retrieve)
    fake = fake_llm(ROUTE, ANSWER)
    result = client.post("/api/tutor/ask", json=request(question="Explain this page simply")).json()
    assert result["sources"] and result["answer"]
    retrieve.assert_awaited_once()
    assert retrieve.call_args.kwargs["lesson"] is lesson
    assert len(fake.support_calls) == 1


@pytest.mark.usefixtures("learner")
@pytest.mark.parametrize("change", ["text", "approval"])
def test_direct_page_evidence_is_rechecked_after_verification_without_retrying_generation(
    client, fake_llm, monkeypatch, change
):
    fake = fake_llm(ROUTE, ANSWER)
    original = fake.structured

    async def structured(**kwargs):
        result = await original(**kwargs)
        if kwargs["system"].startswith(("EVIDENCE_SUPPORT_REVIEW_V1", "SENTENCE_SUPPORT_REVIEW_V1")):
            source = app.state.services.repository.sources["quran:5:6"]
            source["text_ar" if change == "text" else "review_status"] = "changed" if change == "text" else "pending"
        return result

    monkeypatch.setattr(fake, "structured", structured)
    result = client.post("/api/tutor/ask", json=request(question="Explain this page simply")).json()
    assert result["sources"] == {} and result["ai_generated"] is False
    assert len(fake.calls) == 2 and len(fake.support_calls) == 1
