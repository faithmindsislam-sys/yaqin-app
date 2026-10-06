"""Ask & Check through the agents service: the learner's JWT is forwarded, library sources are
citable, Yaqin's invariants still apply, and any agent failure falls back to the in-process tutor."""

import hashlib
import json

import pytest

from app.gateways.agent_gateway import AgentGateway, AgentUnavailable

pytestmark = pytest.mark.usefixtures("learner")

RID = "b" * 32
SID = "library:" + hashlib.sha256(json.dumps([RID, RID, "P1"], separators=(",", ":")).encode()).hexdigest()[:24]
LIB = {"id": SID, "kind": "library", "ref_en": "aqidah basics, p. 6", "ref_ar": "aqidah basics، ص 6",
       "text_ar": "التوحيد هو إفراد الله بالعبادة", "text_en": "", "translation": None, "origin": "Yaqin library",
       "url": None, "grading": None, "review_status": "unreviewed", "eligibility": "rag_access_eligible",
       "resource_id": RID, "document_id": RID, "passage_id": "P1", "uri": "s3://x",
       "original_text": "[page 6]\nالتوحيد هو إفراد الله بالعبادة"}
ROUTE = {"tier": "A", "hostile": False, "search_query": "wudu face arms وضوء"}


class FakeAgent(AgentGateway):
    enabled = True

    def __init__(self, reply=None, error=None):
        self.reply, self.error, self.calls = reply, error, []

    async def ask(self, payload, *, authorization):
        self.calls.append((payload, authorization))
        if self.error:
            raise self.error
        return {**self.reply, "library_sources": list(self.reply.get("library_sources", []))}


@pytest.fixture
def agent(monkeypatch):
    def install(**kw):
        from app.main import app

        fake = FakeAgent(**kw)
        monkeypatch.setattr(app.state.services.tutor, "agent", fake)
        return fake

    return install


def ask(client, **headers):
    r = client.post("/api/tutor/ask", json={"question": "What are the parts of wudu?", "lang": "en"}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_agent_answer_forwards_the_learner_jwt_and_cites_library_passages(client, fake_llm, agent):
    fake_llm(ROUTE)  # router + independent offline support judge
    fake = agent(reply={"answer": f"Wudu. [[quran:5:6]] Context: [[{SID}]]",
                        "makes_religious_claim": True, "follow_ups": ["Next?"], "library_sources": [LIB]})
    body = ask(client, Authorization="Bearer learner-jwt")
    payload, authorization = fake.calls[0]
    assert authorization == "Bearer learner-jwt"
    assert payload["tier"] == "A" and "quran:5:6" in [s["id"] for s in payload["sources"]]
    cited = [b["id"] for b in body["answer"] if b["type"] == "source"]
    assert cited == ["quran:5:6", SID]  # canonical and request-scoped RAG ownership both validate
    assert body["sources"][SID]["kind"] == "library"
    assert body["follow_ups"] == ["Next?"]


def test_agent_claim_without_a_valid_citation_still_abstains(client, fake_llm, agent):
    fake_llm(ROUTE)
    agent(reply={"answer": "Wudu has four parts.", "makes_religious_claim": True, "follow_ups": []})
    body = ask(client, Authorization="Bearer learner-jwt")
    assert body["tier"] == "NONE" and body["sources"] == {}


def test_agent_outage_falls_back_to_the_in_process_tutor(client, fake_llm, agent):
    fake_llm(ROUTE, {"answer": "Wudu. [[quran:5:6]]", "makes_religious_claim": True, "follow_ups": []})
    fake = agent(error=AgentUnavailable("down"))
    body = ask(client, Authorization="Bearer learner-jwt")
    assert len(fake.calls) == 1
    assert [b["id"] for b in body["answer"] if b["type"] == "source"] == ["quran:5:6"]


def test_gateway_rejects_malformed_or_falsely_approved_library_sources():
    from app.domain.safety import SafetyFailure
    from app.gateways.http_agent_gateway import _library_sources

    assert _library_sources([LIB])[0]["review_status"] == "unreviewed"
    for bad in ({**LIB, "id": "quran:1:1"}, {**LIB, "kind": "quran"}, {**LIB, "text_ar": 5}, "x",
                {**LIB, "review_status": "approved"}, {**LIB, "original_text": "unrelated"}):
        with pytest.raises(SafetyFailure):
            _library_sources([LIB, bad])


def test_stable_library_identity_survives_rank_changes_but_not_changed_original_evidence():
    from app.domain.safety import SafetyFailure
    from app.domain.sources import library_sources

    identity = [RID, RID, LIB["uri"], LIB["original_text"]]
    stable = {**LIB, "id": "library:" + hashlib.sha256(json.dumps(identity, separators=(",", ":")).encode()).hexdigest()[:24]}
    assert library_sources([{**stable, "passage_id": "P2"}])[0]["id"] == stable["id"]
    assert library_sources([LIB])[0]["id"] == SID  # Existing deployment remains compatible.
    for field, value in (("uri", "s3://different"), ("resource_id", "a" * 32),
                         ("original_text", LIB["original_text"] + " "), ("eligibility", "revoked")):
        with pytest.raises(SafetyFailure):
            library_sources([{**stable, field: value}])


def test_unknown_agent_citation_withholds_complete_answer(client, fake_llm, agent):
    fake_llm(ROUTE)
    agent(reply={"answer": "Wudu. [[quran:5:6]] [[library:unknown]]", "makes_religious_claim": True,
                 "follow_ups": [], "library_sources": [LIB]})
    body = ask(client, Authorization="Bearer learner-jwt")
    assert body["sources"] == {} and body["tier"] == "NONE"


def test_withdrawn_approved_source_still_abstains_on_the_agent_path(client, fake_llm, agent, monkeypatch):
    from app.main import app

    fake_llm(ROUTE)
    agent(reply={"answer": f"Wudu. [[quran:5:6]] [[{SID}]]", "makes_religious_claim": True,
                 "follow_ups": [], "library_sources": [LIB]})
    repo = app.state.services.tutor.repository
    real = repo.get_sources
    calls = []

    async def withdrawn_at_recheck(ids):
        calls.append(list(ids))
        found = await real(ids)
        if len(calls) > 1:  # retrieval already happened; the source is withdrawn before the reply
            found = {i: {**s, "review_status": "pending"} for i, s in found.items()}
        return found

    monkeypatch.setattr(repo, "get_sources", withdrawn_at_recheck)
    body = ask(client, Authorization="Bearer learner-jwt")
    assert body["tier"] == "NONE" and body["sources"] == {}
    assert all(not i.startswith("library:") for i in calls[-1])  # library ids are never looked up in Yaqin
