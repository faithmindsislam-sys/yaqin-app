"""The review agent reuses a passing AI review for unchanged content, so publishing
(submit + approve on the same text) runs the slow model pass once, not twice."""

import pytest

from app.agents.review.agent import ReviewAgent
from app.gateways.llm_gateway import LLMGateway, LLMUnavailable


class CountingLLM(LLMGateway):
    async def assess(self, value, source):
        pass  # explicit offline fixture

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = 0

    async def structured(self, **kwargs):
        if kwargs["system"].startswith("EVIDENCE_SUPPORT_REVIEW_V1"):
            from tests.support_fake import support_reply
            self.support_calls = getattr(self, "support_calls", []) + [kwargs]
            return support_reply(kwargs)
        self.calls += 1
        if not self.outputs:
            raise LLMUnavailable("no more outputs")
        return self.outputs.pop(0)

    async def close(self):
        pass


class Repo:
    async def get_sources(self, ids):
        return {i: {"id": i, "kind": "quran", "text_ar": "", "text_en": "Wash your face.",
                    "translation": "Saheeh International", "url": "https://quran.com/5/6",
                    "review_status": "approved"} for i in ids}


def lesson(status="draft", body="Wash your face."):
    bi = lambda s: {"en": s, "ar": s}  # noqa: E731
    return {"id": "l1", "status": status, "author_id": "a1", "title": bi("Wudu"), "summary": bi("Washing."),
            "cards": [{"id": "c1", "kind": "concept", "title": bi("Wash"), "body": bi(body), "sources": ["quran:5:6"]}]}


@pytest.mark.asyncio
async def test_submit_then_approve_runs_the_ai_review_once():
    llm = CountingLLM({"issues": []})
    agent = ReviewAgent(Repo(), llm)
    first = await agent.check(lesson(status="draft"))       # submit
    second = await agent.check(lesson(status="in_review"))  # approve: same text, new status
    assert llm.calls == 1
    assert first["ready_for_reviewer"] and second["ready_for_reviewer"]
    assert second["checks"]["ai_review"] is True and second["checks"]["ai_review_reused"] is True


@pytest.mark.asyncio
async def test_edited_content_is_reviewed_again():
    llm = CountingLLM({"issues": []}, {"issues": []})
    agent = ReviewAgent(Repo(), llm)
    await agent.check(lesson(body="Wash your face."))
    await agent.check(lesson(body="Wash your face and hands."))
    assert llm.calls == 2


@pytest.mark.asyncio
async def test_blocking_result_is_not_reused():
    blocking = {"issues": [{"card": "c1", "severity": "high", "issue": "overreach", "suggestion": "soften"}]}
    llm = CountingLLM(blocking, {"issues": []})
    agent = ReviewAgent(Repo(), llm)
    assert (await agent.check(lesson()))["ready_for_reviewer"] is False
    assert (await agent.check(lesson()))["ready_for_reviewer"] is True
    assert llm.calls == 2


@pytest.mark.asyncio
async def test_rule_checks_still_run_on_a_reused_review():
    llm = CountingLLM({"issues": []})
    agent = ReviewAgent(Repo(), llm)
    await agent.check(lesson())
    unsourced_quote = lesson()
    unsourced_quote["cards"].append({"id": "q1", "kind": "quote", "title": {"en": "Q", "ar": "Q"}, "sources": []})
    out = await agent.check(unsourced_quote)  # new content: re-reviewed, and the rule fires
    assert any(i["origin"] == "rule" and i["card"] == "q1" for i in out["issues"])


@pytest.mark.asyncio
async def test_requested_ai_review_failure_cannot_look_like_a_pass():
    llm = CountingLLM()
    agent = ReviewAgent(Repo(), llm)
    out = await agent.check(lesson())
    assert not out["ready_for_reviewer"]
    assert not out["checks"]["ai_review"]
    assert any(i["severity"] == "high" and "not completed" in i["issue"] for i in out["issues"])
    # Explicit rule-only review keeps its existing meaning for saves and human workflow.
    assert (await agent.check(lesson(), ai=False))["ready_for_reviewer"]


@pytest.mark.asyncio
async def test_review_never_silently_truncates_a_candidate():
    llm = CountingLLM({"issues": []})
    out = await ReviewAgent(Repo(), llm).check(lesson(body="x" * 60001))
    assert not out["ready_for_reviewer"]
    assert llm.calls == 0


@pytest.mark.parametrize("lang", ["en", "ar"])
@pytest.mark.asyncio
async def test_duplicate_page_bodies_block_even_when_ai_reports_no_issues(lang):
    draft = lesson()
    first = draft["cards"][0]
    other = "ar" if lang == "en" else "en"
    draft["cards"].append({**first, "id": "c2", "kind": "practice",
                           "title": {"en": "Different title", "ar": "عنوان آخر"},
                           "body": {lang: "  WASH   YOUR FACE.\n", other: "A distinct reflection."}})
    agent = ReviewAgent(Repo(), CountingLLM({"issues": []}))
    for ai in (True, False):
        out = await agent.check(draft, ai=ai)
        assert out["ready_for_reviewer"] is False
        assert any(i["card"] == "c2" and i["severity"] == "high" and
                   f"{lang} repeats page 1" in i["issue"] for i in out["issues"])


@pytest.mark.asyncio
async def test_shared_titles_and_empty_quote_bodies_are_not_duplicate_prose():
    draft = lesson()
    first = draft["cards"][0]
    draft["cards"].append({**first, "id": "c2", "body": {"en": "A distinct reflection.", "ar": "تأمل مختلف."}})
    draft["cards"] += [{"id": f"q{i}", "kind": "quote", "title": first["title"],
                        "body": {"en": "", "ar": ""}, "sources": ["quran:5:6"]} for i in range(2)]
    out = await ReviewAgent(Repo(), CountingLLM({"issues": []})).check(draft)
    assert out["ready_for_reviewer"] is True
