"""Versioned cross-service review plumbing with offline independent-judge fixtures."""
import sys
import time
from copy import deepcopy
from pathlib import Path

import pytest

from app.agents.tutor import practice
from app.domain.support import (REMOTE_REVIEW_POLICY, REMOTE_REVIEW_VERSION, binding_hash,
                                SupportFailure, evidence_texts, source_hashes, text_units)
from app.domain.operations import Budget, CURRENT
from app.contracts.tutor import AskRequest
from app.domain.search import Retrieved
from app.gateways.agent_gateway import AgentGateway, AgentUnavailable
from app.main import app
from tests.api.test_practice import REQUEST, ROUTE as PRACTICE_ROUTE, questions
from tests.api.test_tutor_agent import LIB, ROUTE

pytestmark = pytest.mark.usefixtures("learner")


def review_envelope(request, sources, verdict):
    return {"version": REMOTE_REVIEW_VERSION, "policy": REMOTE_REVIEW_POLICY,
            "requestHash": binding_hash(request), "sourceHashes": source_hashes(sources), "verdict": verdict}


def test_contract_producer_matches_when_adjacent_service_checkout_is_available():
    remote_src = Path(__file__).resolve().parents[4] / "faithminds-agents" / "src"
    if not remote_src.exists():
        pytest.skip("Adjacent service checkout unavailable; standalone contract tests still run")
    sys.path.insert(0, str(remote_src))
    from faithminds_agents.support import review_envelope as remote_envelope
    request = {"question": "معنى الوضوء؟", "supportRequestId": "a" * 32}
    sources = {LIB["id"]: LIB}
    verdict = {"personal_ruling": False, "units": []}
    assert remote_envelope(request, sources, verdict) == review_envelope(request, sources, verdict)


class ReviewedAgent(AgentGateway):
    enabled = True

    def __init__(self, change=None, legacy=False):
        self.change, self.legacy, self.calls = change, legacy, []

    async def ask(self, payload, *, authorization):
        self.calls.append(deepcopy(payload))
        sources = deepcopy(await app.state.services.repository.get_sources([s["id"] for s in payload["sources"]]))
        sources[LIB["id"]] = deepcopy(LIB)
        result = {"answer": f"Wudu. [[quran:5:6]] Context: [[{LIB['id']}]]", "follow_ups": ["What does wudu mean?"],
                  "makes_religious_claim": True, "library_sources": [deepcopy(LIB)], "learning_context_version": "1"}
        if payload.get("mode") == "practice":
            result.update(answer="", follow_ups=[], practice_version="1",
                          practice=practice.validate(questions(), sources))
        units = text_units({"answer": result["answer"], "follow_ups": result["follow_ups"]})
        if "practice" in result:
            units.update(practice.units(result["practice"]))
        evidence = [{"source": sid, "excerpt": texts[0]} for sid, source in sources.items()
                    if (texts := [t for t in evidence_texts(source) if t.strip()])]
        verdict = {"personal_ruling": False, "units": [
            {"id": uid, "claim": text, "verdict": "supported", "evidence": deepcopy(evidence)}
            for uid, text in units.items()]}
        if not self.legacy:
            result["support_review"] = review_envelope(payload, sources, verdict)
        if self.change:
            self.change(result)
        return result


@pytest.mark.parametrize("legacy", [True, False])
def test_remote_judge_is_reused_only_with_complete_bound_contract(client, fake_llm, monkeypatch, legacy):
    fake = fake_llm(ROUTE)
    remote = ReviewedAgent(legacy=legacy)
    monkeypatch.setattr(app.state.services.tutor, "agent", remote)
    out = client.post("/api/tutor/ask", json={"question": "Explain wudu", "track": "first-steps"},
                      headers={"Authorization": "Bearer learner"}).json()
    assert out["ai_generated"] and out["sources"]
    assert len(fake.calls) == 1  # Local classifier only; writer was remote.
    assert len(getattr(fake, "support_calls", [])) == (1 if legacy else 0)
    assert len(remote.calls) == 1 and len(remote.calls[0]["supportRequestId"]) == 32


@pytest.mark.parametrize("failure", ["missing", "version", "policy", "request", "raw-source", "view-source",
                                      "missing-unit", "claim", "excerpt", "unknown-source", "personal", "unsupported",
                                      "follow-up", "current-source"])
def test_invalid_remote_review_withholds_without_another_model_call(client, fake_llm, monkeypatch, failure):
    def change(result):
        review = result["support_review"]
        rows = review["verdict"]["units"]
        if failure == "missing": result["support_review"] = None
        if failure in ("version", "policy", "request"):
            review[{"request": "requestHash"}.get(failure, failure)] = "wrong"
        if failure in ("raw-source", "view-source"):
            review["sourceHashes"]["quran:5:6"]["record" if failure == "raw-source" else "view"] = "wrong"
        if failure == "missing-unit": rows.pop()
        if failure == "claim": rows[0]["claim"] += " changed"
        if failure == "excerpt": rows[0]["evidence"][0]["excerpt"] = "Fabricated original evidence"
        if failure == "unknown-source": rows[0]["evidence"][0]["source"] = "quran:unknown"
        if failure == "personal": review["verdict"]["personal_ruling"] = True
        if failure == "unsupported": rows[0]["verdict"] = "unsupported"
        if failure == "follow-up": result["follow_ups"].append("An unreviewed religious presupposition?")
        if failure == "current-source": app.state.services.repository.sources["quran:5:6"]["review_status"] = "pending"
    fake = fake_llm(ROUTE)
    remote = ReviewedAgent(change)
    monkeypatch.setattr(app.state.services.tutor, "agent", remote)
    out = client.post("/api/tutor/ask", json={"question": "Explain wudu"}, headers={"Authorization": "Bearer learner"}).json()
    assert out["ai_generated"] is False and out["sources"] == {}
    assert len(fake.calls) == len(remote.calls) == 1 and not getattr(fake, "support_calls", [])


@pytest.mark.parametrize("field", [None, "question", "options", "hint", "explanation", "correct"])
def test_remote_practice_review_covers_both_languages_and_designated_answers(client, fake_llm, monkeypatch, field):
    def change(result):
        if field:
            rows = result["support_review"]["verdict"]["units"]
            row = next(row for row in rows if field in row["id"] and row["id"].endswith(".ar"))
            rows.remove(row)
    fake = fake_llm(PRACTICE_ROUTE)
    remote = ReviewedAgent(change)
    monkeypatch.setattr(app.state.services.tutor, "agent", remote)
    out = client.post("/api/tutor/ask", json=REQUEST, headers={"Authorization": "Bearer learner"}).json()
    if field:
        assert out["practice_fallback"] and "practice" not in out
    else:
        assert len(out["practice"]) == 2 and out["ai_generated"]
    assert len(fake.calls) == len(remote.calls) == 1 and not getattr(fake, "support_calls", [])


def test_untrusted_shortcut_flag_cannot_skip_legacy_verification(client, fake_llm, monkeypatch):
    fake = fake_llm(ROUTE)
    remote = ReviewedAgent(lambda result: result.update(_support_verified=True), legacy=True)
    monkeypatch.setattr(app.state.services.tutor, "agent", remote)
    out = client.post("/api/tutor/ask", json={"question": "Explain wudu"}, headers={"Authorization": "Bearer learner"}).json()
    assert out["ai_generated"] and len(getattr(fake, "support_calls", [])) == 1


async def test_remote_outage_reserves_two_calls_and_stops_before_unverifiable_local_fallback(fake_llm, monkeypatch):
    from tests.api.test_tutor_agent import FakeAgent
    fake = fake_llm(ROUTE)
    remote = FakeAgent(error=AgentUnavailable("outage"))
    tutor = app.state.services.tutor
    monkeypatch.setattr(tutor, "agent", remote)
    budget = Budget(time.monotonic() + 55, 200000, 4, model_calls=1, kind="tutor")
    token = CURRENT.set(budget)
    try:
        source = deepcopy(app.state.services.repository.sources["quran:5:6"])
        retrieved = Retrieved({"quran:5:6": source}, {"quran:5:6": 1})
        with pytest.raises(SupportFailure):
            await tutor._agent_answer(AskRequest(question="Explain wudu"), "A", ROUTE, retrieved,
                                      None, "Bearer learner")
        assert budget.model_calls == 3 and budget.remote_calls == 2
        assert len(remote.calls) == 1 and not fake.calls and not getattr(fake, "support_calls", [])
    finally:
        CURRENT.reset(token)
